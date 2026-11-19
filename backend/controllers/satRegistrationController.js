const Registration = require("../models/Registration");
const { createHmac, randomInt, timingSafeEqual } = require("node:crypto");
const {
  sendVerificationCode,
  sendStudentRegistrationNotification,
  sendStudentVerifiedNotification,
} = require("../services/emailService");
const { createStudentToken } = require("../services/studentAuth");

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function emailErrorResponse(error) {
  if (error.status) return { status: error.status, message: error.message };
  if (error.code === "EAUTH") {
    return {
      status: 502,
      message: "Brevo rejected the SMTP credentials. Check BREVO_SMTP_USER and BREVO_SMTP_KEY in the backend environment.",
    };
  }
  if (error.name === "TypeError" || ["ETIMEDOUT", "ECONNECTION", "ECONNREFUSED", "ENOTFOUND", "ESOCKET", "ETLS"].includes(error.code)) {
    return {
      status: 502,
      message: "Could not reach Brevo. Check the backend network connection and try again.",
    };
  }
  return {
    status: 502,
    message: "Brevo could not send the message. Check the verified EMAIL_FROM sender and Brevo SMTP settings.",
  };
}

function hashCode(registrationId, code) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error("OTP_SECRET or JWT_SECRET must be configured in backend/.env.");
    error.status = 503;
    throw error;
  }
  return createHmac("sha256", secret).update(`${registrationId}:${code}`).digest("hex");
}

function requiredText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function createRegistration(request, response, readJson, send) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    send(response, error.message === "Request body must be valid JSON." ? 400 : 413, { error: error.message });
    return;
  }

  const { name, email, phone, curriculum, gender, password } = body;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  const trimmedPhone = typeof phone === "string" ? phone.trim() : "";

  if (!trimmedName || !trimmedEmail || !trimmedPhone) {
    send(response, 400, { error: "Name, email, and phone number are required." });
    return;
  }

  // Name validation: letters, spaces, hyphens, apostrophes, periods only. Numbers strictly forbidden!
  if (/\d/.test(trimmedName)) {
    send(response, 400, { error: "Full name cannot contain numbers." });
    return;
  }
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,79}$/u.test(trimmedName)) {
    send(response, 400, { error: "Enter a valid full name using letters and spaces." });
    return;
  }

  // Email validation: standard format, strictly alphabetic TLD (2 to 10 letters), no trailing numbers/chars
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,10}$/;
  if (trimmedEmail.length > 254 || !emailRegex.test(trimmedEmail) || trimmedEmail.includes("..")) {
    send(response, 400, { error: "Enter a valid email address (numbers or invalid characters after the domain extension are not allowed)." });
    return;
  }

  // Phone validation: letters are strictly not allowed, and phone digits must be valid (10-digit number)
  if (/[a-zA-Z]/.test(trimmedPhone)) {
    send(response, 400, { error: "Phone number cannot contain letters." });
    return;
  }
  const phoneDigits = trimmedPhone.replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    send(response, 400, { error: "Enter a valid 10-digit phone number." });
    return;
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  let registration;
  try {
    const regPayload = {
      name: trimmedName,
      email: trimmedEmail.toLowerCase(),
      phone: trimmedPhone,
      curriculum: curriculum || "General",
      gender: gender || "",
      otpExpiresAt: new Date(Date.now() + OTP_LIFETIME_MS),
    };
    if (password && typeof password === "string") {
      const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || "sat-secret-key";
      regPayload.passwordHash = createHmac("sha256", secret).update(password).digest("hex");
    }
    registration = new Registration(regPayload);
    registration.otpHash = hashCode(registration.id, code);
    await registration.save();

    // Concurrently send OTP to student and registration details to the admin.
    const studentMailPromise = sendVerificationCode(registration.email, code);

    // Send full student registration details to admin asynchronously without blocking the user
    sendStudentRegistrationNotification(registration).catch((adminMailError) => {
      console.warn("Notice: Student registration saved, but admin notification email could not be delivered:", adminMailError.message);
    });

    // Wait for the verification code email to ensure student receives it
    await studentMailPromise;
  } catch (error) {
    if (registration?._id) await Registration.deleteOne({ _id: registration._id });
    const emailError = emailErrorResponse(error);
    send(response, emailError.status, { error: emailError.message });
    return;
  }
  send(response, 201, { id: registration.id, status: "registered", message: "Verification code sent to your email." });
}

async function verifyRegistration(request, response, registrationId, readJson, send) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    send(response, error.message === "Request body must be valid JSON." ? 400 : 413, { error: error.message });
    return;
  }

  const registration = await Registration.findById(registrationId).select("+otpHash");
  if (!registration) {
    send(response, 404, { error: "Registration not found. Please register again." });
    return;
  }
  if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
    send(response, 400, { error: "Enter the six-digit verification code sent to your email." });
    return;
  }

  if (registration.verified) {
    send(response, 200, { id: registrationId, status: "verified", token: createStudentToken(registration) });
    return;
  }
  if (registration.otpAttempts >= MAX_OTP_ATTEMPTS) {
    send(response, 429, { error: "Too many incorrect attempts. Please register again for a new code." });
    return;
  }
  if (!registration.otpExpiresAt || registration.otpExpiresAt.getTime() <= Date.now()) {
    send(response, 400, { error: "That verification code has expired. Please register again for a new code." });
    return;
  }

  const submittedHash = Buffer.from(hashCode(registration.id, body.code), "hex");
  const savedHash = Buffer.from(registration.otpHash || "", "hex");
  if (submittedHash.length !== savedHash.length || !timingSafeEqual(submittedHash, savedHash)) {
    registration.otpAttempts += 1;
    await registration.save();
    send(response, registration.otpAttempts >= MAX_OTP_ATTEMPTS ? 429 : 400, {
      error: registration.otpAttempts >= MAX_OTP_ATTEMPTS
        ? "Too many incorrect attempts. Please register again for a new code."
        : "The verification code is incorrect.",
    });
    return;
  }

  registration.verified = true;
  registration.otpHash = undefined;
  registration.otpExpiresAt = undefined;
  await registration.save();

  // Send student verification confirmation to the admin.
  try {
    await sendStudentVerifiedNotification(registration);
  } catch (adminMailError) {
    console.warn("Notice: Student verified, but admin notification email could not be delivered:", adminMailError.message);
  }

  send(response, 200, { id: registrationId, status: "verified", token: createStudentToken(registration) });
}

async function loginRegistration(request, response, readJson, send) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    send(response, error.message === "Request body must be valid JSON." ? 400 : 413, { error: error.message });
    return;
  }

  const { email, password } = body;
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    send(response, 400, { error: "Email and password are required." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,10}$/;
  if (normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail) || normalizedEmail.includes("..")) {
    send(response, 400, { error: "Enter a valid email address (e.g. you@example.com)." });
    return;
  }

  const registration = await Registration.findOne({ email: normalizedEmail }).select("+passwordHash");
  if (!registration) {
    send(response, 401, { error: "No account found with this email. Please register first." });
    return;
  }

  if (!registration.passwordHash) {
    send(response, 401, { error: "This account has no password set. Please create a new registration." });
    return;
  }

  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || "sat-secret-key";
  const submittedHash = createHmac("sha256", secret).update(password).digest("hex");
  const submittedBuf = Buffer.from(submittedHash, "hex");
  const storedBuf = Buffer.from(registration.passwordHash || "", "hex");

  if (submittedBuf.length !== storedBuf.length || !timingSafeEqual(submittedBuf, storedBuf)) {
    send(response, 401, { error: "Incorrect password. Please try again." });
    return;
  }

  send(response, 200, {
    id: registration.id,
    name: registration.name,
    email: registration.email,
    phone: registration.phone,
    gender: registration.gender,
    curriculum: registration.curriculum,
    verified: Boolean(registration.verified),
    token: registration.verified ? createStudentToken(registration) : null,
  });
}

module.exports = { createRegistration, verifyRegistration, loginRegistration };

const path = require("node:path");
const fs = require("node:fs");
const nodemailer = require("nodemailer");

const LOGO_PATH = path.join(__dirname, "../assets/edutech-logo.png");
const LOGO_CID = "edutechex-logo@edutechex.com";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PUBLIC_LOGO_FALLBACK = "https://i.tracxn.com/logo/company/edutechex.com_Logo_8f5b86b8-bcc0-4c54-8017-abbd785f1290.jpg";

function getLogoConfig() {
  const customUrl = process.env.LOGO_URL?.trim();
  if (customUrl) {
    return {
      src: customUrl,
      isAttachment: false,
    };
  }

  // Prefer the bundled EduTechEx brand asset so verification emails show our
  // actual logo instead of the third-party fallback image.
  if (fs.existsSync(LOGO_PATH)) {
    return {
      src: `cid:${LOGO_CID}`,
      isAttachment: true,
      attachment: {
        filename: "edutechex-logo.png",
        path: LOGO_PATH,
        cid: LOGO_CID,
        contentType: "image/png",
      },
    };
  }

  return {
    src: PUBLIC_LOGO_FALLBACK,
    isAttachment: false,
  };
}

function getBrevoConfig() {
  const host = process.env.BREVO_SMTP_HOST?.trim() || "smtp-relay.brevo.com";
  const port = Number(process.env.BREVO_SMTP_PORT || 587);
  const user = process.env.BREVO_SMTP_USER?.trim();
  const password = process.env.BREVO_SMTP_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.trim() || "adityacv@edutechex.com";

  if (!user || !password || !from) {
    const missing = [
      !user && "BREVO_SMTP_USER",
      !password && "BREVO_SMTP_KEY",
      !from && "EMAIL_FROM",
    ].filter(Boolean);
    const error = new Error(`Email service is not fully configured. Missing ${missing.join(", ")} in backend/.env.`);
    error.status = 503;
    throw error;
  }

  const parsed = from.match(/^(.*?)\s*<([^>]+)>$/);
  const sender = parsed
    ? { name: parsed[1].replace(/^"|"$/g, "").trim(), email: parsed[2].trim() }
    : { name: "EduTechEx", email: from };

  return { host, port, user, password, sender, adminEmail };
}

let transporter;
let transporterConfig;

async function sendEmail({ to, subject, text, html, attachments = [] }) {
  const config = getBrevoConfig();
  const currentConfig = `${config.host}:${config.port}:${config.user}:${config.password}`;
  if (!transporter || transporterConfig !== currentConfig) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.password },
    });
    transporterConfig = currentConfig;
  }

  const emailAttachments = Array.isArray(attachments) ? [...attachments] : [];
  const logo = getLogoConfig();
  const htmlContent = typeof html === "string" ? html : html?.content;
  if (logo?.isAttachment && logo?.attachment) {
    const alreadyAttached = emailAttachments.some(
      (att) => att.cid === LOGO_CID || att.cid === `<${LOGO_CID}>`
    );
    if (!alreadyAttached && typeof htmlContent === "string" && htmlContent.includes(`cid:${LOGO_CID}`)) {
      emailAttachments.push(logo.attachment);
    }
  }

  await transporter.sendMail({
    from: config.sender.name
      ? { name: config.sender.name, address: config.sender.email }
      : config.sender.email,
    to,
    subject,
    text,
    html,
    attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
  });
}

function logoHeader(borderColor, fallback) {
  const logo = getLogoConfig();
  if (logo) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;border-bottom:2px solid ${borderColor};margin:0;padding:0;">
      <tr>
        <td bgcolor="#ffffff" style="background-color:#ffffff;padding:18px 24px;text-align:left;">
          <a href="https://www.edutechex.com" target="_blank" style="text-decoration:none;display:inline-block;">
            <img src="${logo.src}" alt="EDUTECHEX" width="162" height="34" style="display:block;width:162px;max-width:175px;height:34px;object-fit:contain;border:0;outline:none;text-decoration:none;font-family:${FONT};font-size:18px;font-weight:800;color:#0284c7;letter-spacing:1px;" />
          </a>
        </td>
      </tr>
    </table>`;
  }
  return fallback
    ? `<div style="background:#0284c7;padding:16px 24px;color:#ffffff;">
      <h2 style="margin:0;font-size:19px;font-weight:bold;">EDUTECHEX</h2>
    </div>`
    : "";
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

async function sendVerificationCode(email, code) {
  getBrevoConfig();

  await sendEmail({
    to: email,
    subject: "Your EduTechEx verification code",
    text: `Your EduTechEx verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `<div style="font-family:${FONT};max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;">
      ${logoHeader("#0284c7", true)}
      <div style="padding:26px 24px;">
        <h2 style="color:#0f172a;font-size:19px;margin-top:0;font-weight:700;">Account Verification Code</h2>
        <p style="color:#334155;font-size:14.5px;line-height:1.5;">Your six-digit verification code for the EduTechEx Digital SAT Mock Examination platform is:</p>
        <div style="background:#f0f9ff;border:1.5px dashed #0284c7;border-radius:8px;padding:16px;text-align:center;margin:22px 0;">
          <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#0284c7;">${esc(code)}</span>
        </div>
        <p style="color:#64748b;font-size:13px;line-height:1.4;margin-bottom:0;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
      </div>
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 24px;font-size:12px;color:#64748b;text-align:center;">
        EduTechEx Global â€” SAT Diagnostic Preparation &amp; Examination
      </div>
    </div>`,
  });
}

async function sendStudentRegistrationNotification(studentData) {
  const { adminEmail } = getBrevoConfig();
  const { name, email, phone, curriculum, gender, createdAt } = studentData;

  const formattedDate = new Date(createdAt || Date.now()).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "medium",
  });

  const subject = `New Student SAT Registration: ${String(name || "Candidate").replace(/[\r\n]/g, " ")}`;

  const text = `
A new student has registered on EduTechEx for the Digital SAT Mock Exam:

Student Details:
- Full Name: ${name}
- Email Address: ${email}
- Contact Number: ${phone}
- Curriculum / Board: ${curriculum || "General"}
- Gender: ${gender || "Not specified"}
- Registered At: ${formattedDate}
- Program: Digital SAT Diagnostic & Preparation

EduTechEx Automated Student Notification
`;

  const rows = [
    ["Student Full Name", esc(name)],
    ["Registered Email", `<a href="mailto:${esc(email)}" style="color:#0284c7;text-decoration:none;font-weight:600;">${esc(email)}</a>`],
    ["Contact Number", esc(phone)],
    ["Curriculum / Board", esc(curriculum || "General")],
    ["Gender", esc(gender || "Not specified")],
    ["Registered Program", "Digital SAT Diagnostic Preparation &amp; Examination"],
    ["Registration Timestamp", esc(formattedDate)],
  ]
    .map(
      ([label, value], i) => `<tr style="border-bottom:1px solid #f1f5f9;${i % 2 === 0 ? "background:#f8fafc;" : ""}">
          <td style="padding:11px 14px;font-weight:700;color:#0284c7;width:38%;">${label}</td>
          <td style="padding:11px 14px;color:#0f172a;font-weight:600;">${value}</td>
        </tr>`
    )
    .join("");

  const html = `
<div style="font-family:${FONT};max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;">
  ${logoHeader("#0284c7", false)}
  <div style="background:#0284c7;padding:22px 28px;color:#ffffff;">
    <h2 style="margin:0;font-size:20px;font-weight:700;">New Student SAT Registration</h2>
    <p style="margin:6px 0 0 0;font-size:13.5px;opacity:0.92;">Digital SAT Practice &amp; Diagnostic Assessment</p>
  </div>
  <div style="padding:26px 28px;">
    <p style="margin-top:0;font-size:15px;color:#334155;line-height:1.5;">
      A student has just submitted their registration on the SAT Mock Examination portal. Details are as follows:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;"><tbody>${rows}</tbody></table>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:13px 16px;margin-top:18px;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.4;">
        A 6-digit verification code has been dispatched to <strong>${esc(email)}</strong> for account verification.
      </p>
    </div>
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;font-size:12px;color:#64748b;text-align:center;">
    This is an automated administrative notification sent to <strong>${esc(adminEmail)}</strong> from EduTechEx.
  </div>
</div>`;

  await sendEmail({ to: adminEmail, subject, text, html });
}

async function sendStudentVerifiedNotification(studentData) {
  const { adminEmail } = getBrevoConfig();
  const { name, email, phone, curriculum } = studentData;

  const subject = `Student Verified: ${String(name || "Candidate").replace(/[\r\n]/g, " ")} has activated their SAT account`;

  const html = `
<div style="font-family:${FONT};max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;">
  ${logoHeader("#16a34a", false)}
  <div style="background:#16a34a;padding:18px 24px;color:#ffffff;">
    <h2 style="margin:0;font-size:19px;font-weight:bold;">EduTechEx â€” Student Verified Successfully</h2>
  </div>
  <div style="padding:22px 24px;">
    <p style="margin-top:0;font-size:15px;color:#334155;">
      Student <strong>${esc(name)}</strong> (<a href="mailto:${esc(email)}" style="color:#0284c7;text-decoration:none;">${esc(email)}</a>) has successfully verified their OTP and can now access all SAT mock tests.
    </p>
    <p style="font-size:13.5px;color:#64748b;margin-bottom:0;">
      Phone: <strong>${esc(phone)}</strong> â€¢ Board/Curriculum: <strong>${esc(curriculum || "General")}</strong>
    </p>
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 24px;font-size:12px;color:#64748b;text-align:center;">
    Delivered to admin: ${esc(adminEmail)}
  </div>
</div>`;

  await sendEmail({
    to: adminEmail,
    subject,
    text: `Student ${name} (${email}, ${phone}) has successfully verified their OTP.`,
    html,
  });
}

async function sendCounselingBookingConfirmation(booking) {
  const timeZone = process.env.BOOKING_TIME_ZONE || "Asia/Kolkata";
  const formatTime12 = (value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
  };
  const displayTimeZone = timeZone === "Asia/Kolkata" ? "IST" : timeZone;
  const readableDate = new Date(`${booking.bookingDate}T12:00:00Z`).toLocaleDateString("en-IN", {
    timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const readableTime = `${formatTime12(booking.startTime)} - ${formatTime12(booking.endTime)} ${displayTimeZone}`;
  const meetingLink = typeof booking.meetingLink === "string" && /^https:\/\//.test(booking.meetingLink) ? booking.meetingLink : null;
  const counselor = booking.counselorName || "EduTechEx Counsellor";
  const text = [
    `Hi ${booking.studentName || "Student"},`,
    "Your EduTechEx counseling session is confirmed.",
    `Counselor: ${counselor}`,
    `Date: ${readableDate}`,
    `Time: ${readableTime}`,
    meetingLink ? `Join Google Meet: ${meetingLink}` : "Your meeting link will be sent shortly.",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>EduTechEx counseling confirmation</title></head><body>
<div style="font-family:${FONT};max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;">
  ${logoHeader("#2563eb", false)}
  <div style="padding:24px 28px;color:#0f172a;">
    <h2 style="margin:0 0 14px;color:#1d4ed8;font-size:21px;">Your counseling session is confirmed</h2>
    <p>Hi ${esc(booking.studentName || "Student")}, your EduTechEx session is booked.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 22px;font-size:14px;">
      <tr><td style="padding:8px;color:#64748b;">Counselor</td><td style="padding:8px;font-weight:600;">${esc(counselor)}</td></tr>
      <tr><td style="padding:8px;color:#64748b;">Date</td><td style="padding:8px;font-weight:600;">${esc(readableDate)}</td></tr>
      <tr><td style="padding:8px;color:#64748b;">Time</td><td style="padding:8px;font-weight:600;">${esc(readableTime)}</td></tr>
    </table>
    ${meetingLink ? `<a href="${esc(meetingLink)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:7px;">Join Google Meet</a>` : `<p style="font-weight:600;">Your meeting link will be sent shortly.</p>`}
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 24px;font-size:12px;color:#64748b;text-align:center;">EduTechEx Counseling</div>
</div></body></html>`;
  await sendEmail({
    to: booking.studentEmail,
    subject: "Your EduTechEx counseling session is confirmed",
    text,
    html: { content: html, contentType: "text/html; charset=utf-8" },
  });
}

module.exports = {
  sendVerificationCode,
  sendStudentRegistrationNotification,
  sendStudentVerifiedNotification,
  sendCounselingBookingConfirmation,
};

const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const CounselingBooking = require("../models/counselingBookingModel");
const Counselor = require("../models/counselorModel");
const MockResult = require("../models/mockmodel");
const Registration = require("../models/Registration");
const { getAuthenticatedStudent } = require("../services/studentAuth");
const { syncBookingToGoogleCalendar } = require("../services/googleCalendarService");
const { sendCounselingBookingConfirmation } = require("../services/emailService");
const { isSuperAdminEmail } = require("../services/adminAccess");

// ─────────────────────────────────────────────────────────────────────────────
// Business Rule Constants
// ─────────────────────────────────────────────────────────────────────────────
const FREE_COUNSELING_LIMIT = 3;          // Papers 1-3 → free
const COUNSELING_AMOUNT_PAISE = 99900;    // ₹999 in paise for paper 4+

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getRazorpayConfig() {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const err = new Error("Razorpay is not configured.");
    err.status = 503;
    throw err;
  }
  return { keyId, keySecret };
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...options,
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    const err = new Error("Could not reach Razorpay. Please try again.");
    err.status = 502;
    throw err;
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error("Razorpay could not process this request.");
    err.status = response.status >= 500 ? 502 : 400;
    throw err;
  }
  return result;
}

function signatureMatches(orderId, paymentId, sig, secret) {
  if (typeof sig !== "string" || !/^[a-f\d]{64}$/i.test(sig)) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const submitted = Buffer.from(sig, "hex");
  return submitted.length === expected.length && timingSafeEqual(submitted, expected);
}

/** Determine counseling eligibility and price from mock test number. */
function getCounselingPricing(mockTestNumber) {
  const num = Number(mockTestNumber);
  if (!Number.isInteger(num) || num < 1) return null;
  if (num <= FREE_COUNSELING_LIMIT) {
    return { bookingType: "free", amount: 0, label: "Free 30-Minute Counseling Session" };
  }
  return { bookingType: "paid", amount: COUNSELING_AMOUNT_PAISE, label: "Counseling Session – ₹999" };
}

async function syncAndEmailBooking(booking) {
  await syncBookingToGoogleCalendar(booking);
  try {
    await sendCounselingBookingConfirmation(booking);
    booking.counselingConfirmationEmailSentAt = new Date();
    await booking.save();
  }
  catch (error) { console.error("Counseling confirmation email failed:", error.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/counseling/eligibility?mockTestId=XX
// Student can check if they're eligible and what price applies.
// ─────────────────────────────────────────────────────────────────────────────
async function getCounselingEligibility(request, url, send) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in to check counseling eligibility." });
    return;
  }

  const mockTestId = url.searchParams.get("mockTestId");
  if (!mockTestId) {
    send(400, { error: "mockTestId query parameter is required." });
    return;
  }

  const paddedId = String(mockTestId).padStart(2, "0");

  // Verify the mock result belongs to the authenticated student
  const mockResult = await MockResult.findOne({
    testId: paddedId,
    studentEmail: identity.email,
    status: "completed",
  }).sort({ completedAt: -1 }).lean();

  if (!mockResult) {
    send(404, { error: "No completed mock test found for this paper. Complete the test first." });
    return;
  }

  const mockTestNumber = Number(paddedId);
  const pricing = getCounselingPricing(mockTestNumber);

  // Check if student already has a non-cancelled booking for this mock
  const existingBooking = await CounselingBooking.findOne({
    studentId: identity.id,
    mockTestId: paddedId,
    bookingStatus: { $nin: ["cancelled"] },
  }).lean();

  send(200, {
    success: true,
    eligible: true,
    mockTestId: paddedId,
    mockTestNumber,
    mockTestTitle: mockResult.testTitle,
    mockTestScore: mockResult.scaleScore,
    mockResultId: mockResult._id,
    pricing,
    alreadyBooked: Boolean(existingBooking),
    existingBooking: existingBooking || null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/counseling/book
// Body: { mockTestId, counselorId, bookingDate, startTime }
// ─────────────────────────────────────────────────────────────────────────────
async function bookCounseling(request, readJson, send) {
  let body;
  try { body = await readJson(request); }
  catch (e) { send(400, { error: e.message }); return; }

  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in to book a counseling session." });
    return;
  }

  const student = await Registration.findOne({ _id: identity.id, verified: true }).select("name email phone");
  if (!student) {
    send(401, { error: "Verified student account required." });
    return;
  }

  const { mockTestId, counselorId, bookingDate, startTime } = body;
  if (!mockTestId || !counselorId || !bookingDate || !startTime) {
    send(400, { error: "mockTestId, counselorId, bookingDate, and startTime are all required." });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || isNaN(Date.parse(bookingDate))) {
    send(400, { error: "bookingDate must be YYYY-MM-DD." });
    return;
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    send(400, { error: "startTime must be HH:MM." });
    return;
  }

  const localNowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.BOOKING_TIME_ZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const localNow = Object.fromEntries(localNowParts.map(({ type, value }) => [type, value]));
  const today = `${localNow.year}-${localNow.month}-${localNow.day}`;
  const currentTime = `${localNow.hour}:${localNow.minute}`;
  if (bookingDate < today || (bookingDate === today && startTime <= currentTime)) {
    send(400, { error: "This appointment time has already passed. Please choose a future time." });
    return;
  }

  const paddedId = String(mockTestId).padStart(2, "0");
  const mockTestNumber = parseInt(paddedId, 10);

  // ── Backend pricing validation — never trust frontend ──────────────────────
  const pricing = getCounselingPricing(mockTestNumber);
  if (!pricing) {
    send(400, { error: "Invalid mock test number." });
    return;
  }

  // Verify mock result
  const mockResult = await MockResult.findOne({
    testId: paddedId,
    studentEmail: identity.email,
    status: "completed",
  }).sort({ completedAt: -1 }).lean();
  if (!mockResult) {
    send(403, { error: "You must complete this mock test before booking counseling." });
    return;
  }

  // Prevent duplicate booking for same mock paper
  const existingBooking = await CounselingBooking.findOne({
    studentId: identity.id,
    mockTestId: paddedId,
    bookingStatus: { $nin: ["cancelled"] },
  });
  if (existingBooking) {
    send(409, { error: "You have already booked a counseling session for this mock test." });
    return;
  }

  // Verify counselor exists and is active
  const counselor = await Counselor.findOne({ _id: counselorId, status: "active" });
  if (!counselor) {
    send(404, { error: "Counselor not found or unavailable." });
    return;
  }

  // Verify slot not already booked (atomic check)
  const slotTaken = await CounselingBooking.findOne({
    counselorId,
    bookingDate,
    startTime,
    bookingStatus: { $nin: ["cancelled"] },
  });
  if (slotTaken) {
    send(409, { error: "This time slot is no longer available. Please choose another slot." });
    return;
  }

  // Compute endTime (startTime + 30 min)
  const [h, m] = startTime.split(":").map(Number);
  const totalMin = h * 60 + m + 30;
  const endTime = `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

  // ── FREE BOOKING ───────────────────────────────────────────────────────────
  if (pricing.bookingType === "free") {
    const booking = await CounselingBooking.create({
      studentId: student._id,
      studentEmail: student.email,
      studentName: student.name,
      studentPhone: student.phone,
      counselorId: counselor._id,
      counselorName: counselor.name,
      counselorEmail: counselor.email,
      mockTestId: paddedId,
      mockTestNumber,
      mockTestTitle: mockResult.testTitle,
      mockTestScore: mockResult.scaleScore,
      mockResultId: mockResult._id,
      bookingDate,
      startTime,
      endTime,
      sessionDuration: 30,
      bookingType: "free",
      amount: 0,
      paymentStatus: "not_required",
      bookingStatus: "confirmed",
    });

    // Mark slot as booked in counselor's availability (if explicit slot exists)
    await Counselor.updateOne(
      { _id: counselorId, "availability.date": bookingDate, "availability.startTime": startTime },
      { $set: { "availability.$.isBooked": true, "availability.$.bookedByStudentId": student._id } }
    );

    await syncAndEmailBooking(booking);

    send(201, { success: true, bookingType: "free", booking, message: "Your free counseling session is confirmed!" });
    return;
  }

  // ── PAID BOOKING: Create Razorpay order ───────────────────────────────────
  let keyId;
  try {
    ({ keyId } = getRazorpayConfig());
  } catch (err) {
    send(err.status || 503, { error: err.message });
    return;
  }

  const receipt = `counsel_${Date.now()}_${randomBytes(4).toString("hex")}`;
  let order;
  try {
    order = await razorpayRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: COUNSELING_AMOUNT_PAISE,
        currency: "INR",
        receipt,
        notes: {
          product: "SAT Counseling Session",
          student_email: student.email,
          mock_test_id: paddedId,
          counselor_id: String(counselor._id),
        },
      }),
    });
  } catch (err) {
    send(err.status || 502, { error: err.message });
    return;
  }

  // Create a pending booking record
  const booking = await CounselingBooking.create({
    studentId: student._id,
    studentEmail: student.email,
    studentName: student.name,
    studentPhone: student.phone,
    counselorId: counselor._id,
    counselorName: counselor.name,
    counselorEmail: counselor.email,
    mockTestId: paddedId,
    mockTestNumber,
    mockTestTitle: mockResult.testTitle,
    mockTestScore: mockResult.scaleScore,
    mockResultId: mockResult._id,
    bookingDate,
    startTime,
    endTime,
    sessionDuration: 30,
    bookingType: "paid",
    amount: COUNSELING_AMOUNT_PAISE,
    paymentStatus: "pending",
    bookingStatus: "pending",
    razorpayOrderId: order.id,
  });

  send(201, {
    success: true,
    bookingType: "paid",
    booking,
    razorpayOrder: { keyId, orderId: order.id, amount: order.amount, currency: order.currency },
    student: { name: student.name, email: student.email, phone: student.phone },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/counseling/verify-payment
// Body: { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
// ─────────────────────────────────────────────────────────────────────────────
async function verifyBookingPayment(request, readJson, send) {
  let body;
  try { body = await readJson(request); }
  catch (e) { send(400, { error: e.message }); return; }

  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in to verify payment." });
    return;
  }

  const { bookingId, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
  if (!bookingId || !orderId || !paymentId || !signature) {
    send(400, { error: "bookingId, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required." });
    return;
  }

  const { keySecret } = getRazorpayConfig();
  if (!signatureMatches(orderId, paymentId, signature, keySecret)) {
    send(400, { error: "Payment signature could not be verified." });
    return;
  }

  const booking = await CounselingBooking.findById(bookingId);
  if (!booking) {
    send(404, { error: "Booking not found." });
    return;
  }
  if (String(booking.studentId) !== String(identity.id)) {
    send(403, { error: "This booking belongs to a different student." });
    return;
  }
  if (booking.razorpayOrderId !== orderId) {
    send(400, { error: "Order ID does not match this booking." });
    return;
  }

  // Idempotency — already paid
  if (booking.paymentStatus === "paid") {
    send(200, { success: true, booking });
    return;
  }

  const updated = await CounselingBooking.findOneAndUpdate(
    { _id: bookingId, paymentStatus: "pending" },
    {
      $set: {
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        paidAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    send(409, { error: "Booking could not be confirmed. Contact support with your Razorpay payment ID." });
    return;
  }

  // Mark slot as booked
  await Counselor.updateOne(
    { _id: booking.counselorId, "availability.date": booking.bookingDate, "availability.startTime": booking.startTime },
    { $set: { "availability.$.isBooked": true, "availability.$.bookedByStudentId": booking.studentId } }
  );

  await syncAndEmailBooking(updated);

  send(200, { success: true, booking: updated, message: "Payment verified. Your counseling session is confirmed!" });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/counseling/my-bookings  — student's own bookings
// ─────────────────────────────────────────────────────────────────────────────
async function getMyBookings(request, send) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in to view your bookings." });
    return;
  }
  const bookings = await CounselingBooking.find({ studentId: identity.id })
    .sort({ bookingDate: -1, startTime: -1 })
    .lean();
  send(200, { success: true, count: bookings.length, bookings });
}

async function adminResyncBooking(request, bookingId, send) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) return send(401, { error: "Authentication required." });
  if (!isSuperAdminEmail(identity.email)) return send(403, { error: "Super-admin access required." });
  const admin = await Counselor.findOne({ email: identity.email, status: "active", isAdmin: true }).lean();
  if (!admin) return send(403, { error: "Admin access required." });
  if (!/^[a-f\d]{24}$/i.test(bookingId)) return send(400, { error: "Invalid booking ID." });
  const booking = await CounselingBooking.findById(bookingId);
  if (!booking) return send(404, { error: "Booking not found." });
  if (booking.bookingStatus !== "confirmed") return send(409, { error: "Only confirmed bookings can be synced." });
  const result = await syncBookingToGoogleCalendar(booking);
  try {
    await sendCounselingBookingConfirmation(booking);
    booking.counselingConfirmationEmailSentAt = new Date();
    await booking.save();
  } catch (error) { console.error("Counseling confirmation email failed during calendar resync:", error.message); }
  return send(200, { success: true, calendarSyncStatus: booking.calendarSyncStatus, meetingLink: booking.meetingLink || null, emailSent: Boolean(booking.counselingConfirmationEmailSentAt), syncError: result.success ? null : result.error });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/counseling/:id  — single booking
// ─────────────────────────────────────────────────────────────────────────────
async function getBookingById(request, bookingId, send) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in." });
    return;
  }
  const booking = await CounselingBooking.findById(bookingId).lean();
  if (!booking) {
    send(404, { error: "Booking not found." });
    return;
  }
  if (String(booking.studentId) !== String(identity.id)) {
    send(403, { error: "Access denied." });
    return;
  }
  send(200, { success: true, booking });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/counseling/:id/cancel  — student cancels
// ─────────────────────────────────────────────────────────────────────────────
async function cancelBooking(request, bookingId, readJson, send) {
  let body = {};
  try { body = await readJson(request); } catch (_) {}

  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in." });
    return;
  }

  const booking = await CounselingBooking.findById(bookingId);
  if (!booking) {
    send(404, { error: "Booking not found." });
    return;
  }
  if (String(booking.studentId) !== String(identity.id)) {
    send(403, { error: "You can only cancel your own bookings." });
    return;
  }
  if (["cancelled", "completed"].includes(booking.bookingStatus)) {
    send(409, { error: `Booking is already ${booking.bookingStatus}.` });
    return;
  }

  booking.bookingStatus = "cancelled";
  booking.cancelledAt = new Date();
  booking.cancelledBy = "student";
  booking.cancellationReason = body.reason || null;
  await booking.save();

  // Free up the counselor slot
  await Counselor.updateOne(
    { _id: booking.counselorId, "availability.date": booking.bookingDate, "availability.startTime": booking.startTime },
    { $set: { "availability.$.isBooked": false, "availability.$.bookedByStudentId": null } }
  );

  send(200, { success: true, booking: booking.toObject(), message: "Booking cancelled." });
}

module.exports = {
  getCounselingEligibility,
  bookCounseling,
  verifyBookingPayment,
  getMyBookings,
  getBookingById,
  cancelBooking,
  adminResyncBooking,
};


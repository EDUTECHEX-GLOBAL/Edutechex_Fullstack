const mongoose = require("mongoose");

const counselingBookingSchema = new mongoose.Schema({
  // ── Student ───────────────────────────────────────────────────────────────
  studentId:        { type: mongoose.Schema.Types.ObjectId, ref: "Registration", required: true, index: true },
  studentEmail:     { type: String, required: true, lowercase: true, trim: true, index: true },
  studentName:      { type: String, trim: true },
  studentPhone:     { type: String, trim: true, default: null },

  // ── Counselor ─────────────────────────────────────────────────────────────
  counselorId:      { type: mongoose.Schema.Types.ObjectId, ref: "Counselor", required: true, index: true },
  counselorName:    { type: String, trim: true },
  counselorEmail:   { type: String, trim: true, lowercase: true },

  // ── Mock Test Reference ───────────────────────────────────────────────────
  mockTestId:       { type: String, required: true, trim: true },   // e.g. "01", "04"
  mockTestNumber:   { type: Number, required: true },               // 1, 2, 3, 4 …
  mockTestTitle:    { type: String, trim: true },                   // "Full SAT Mock 04"
  mockTestScore:    { type: Number, default: 0 },                   // scale score out of 1600
  mockResultId:     { type: mongoose.Schema.Types.ObjectId, ref: "MockResult", default: null },

  // ── Session Timing (all in IST) ───────────────────────────────────────────
  bookingDate:      { type: String, required: true },   // "YYYY-MM-DD"
  startTime:        { type: String, required: true },   // "HH:MM"
  endTime:          { type: String, required: true },   // "HH:MM" (startTime + 30 min)
  sessionDuration:  { type: Number, default: 30 },      // minutes

  // ── Pricing ───────────────────────────────────────────────────────────────
  bookingType:      { type: String, enum: ["free", "paid"], required: true },
  amount:           { type: Number, required: true, min: 0 }, // paise (0 for free)

  // ── Payment ───────────────────────────────────────────────────────────────
  paymentStatus: {
    type: String,
    enum: ["not_required", "pending", "paid", "failed", "refunded"],
    default: "not_required",
    index: true,
  },
  razorpayOrderId:   { type: String, default: null, index: true, sparse: true },
  razorpayPaymentId: { type: String, default: null, sparse: true },
  razorpaySignature: { type: String, default: null },
  paidAt:            { type: Date, default: null },

  // ── Status ────────────────────────────────────────────────────────────────
  bookingStatus: {
    type: String,
    enum: ["pending", "confirmed", "cancelled", "completed", "no_show"],
    default: "pending",
    index: true,
  },
  cancelledAt:     { type: Date, default: null },
  cancelledBy:     { type: String, enum: ["student", "counselor", "admin"], default: null },
  cancellationReason: { type: String, trim: true, default: null },
  completedAt:     { type: Date, default: null },

  // Admin / counselor notes
  counselorNotes:  { type: String, trim: true, default: null },

  // ── Future Google Calendar integration fields (optional, placeholder) ──────
  googleCalendarEventId: { type: String, default: null },
  googleCalendarEventUrl:{ type: String, default: null },
  meetingLink:           { type: String, default: null },
  calendarSyncStatus: {
    type: String,
    enum: ["not_synced", "synced", "sync_failed", null],
    default: null,
  },
  counselingConfirmationEmailSentAt: { type: Date, default: null },
}, { timestamps: true });

// Prevent a student from booking counseling for the same mock paper twice
counselingBookingSchema.index(
  { studentId: 1, mockTestId: 1 },
  { unique: true, partialFilterExpression: { bookingStatus: { $nin: ["cancelled"] } } }
);

// Prevent double-booking the same counselor slot
counselingBookingSchema.index(
  { counselorId: 1, bookingDate: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { bookingStatus: { $nin: ["cancelled"] } } }
);

module.exports = mongoose.models.CounselingBooking
  || mongoose.model("CounselingBooking", counselingBookingSchema);


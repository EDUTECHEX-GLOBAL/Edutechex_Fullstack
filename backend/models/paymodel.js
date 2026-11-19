const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  studentEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentName: { type: String, trim: true, maxlength: 100 },
  // `unique: true` already creates the index; the extra `index: true` caused a
  // duplicate-index warning, so it was removed.
  razorpayOrderId: { type: String, required: true, unique: true },
  // Leave this field absent until checkout succeeds. A sparse unique index
  // still indexes explicit null values, which makes multiple pending orders collide.
  razorpayPaymentId: { type: String, default: undefined, unique: true, sparse: true },
  amount: { type: Number, required: true, min: 100 }, // paise
  baseAmount: { type: Number, min: 100 }, // paise before tax
  taxAmount: { type: Number, min: 0 }, // paise
  taxPercent: { type: Number, min: 0, max: 100 },
  currency: { type: String, required: true, uppercase: true, default: "INR" },
  durationDays: { type: Number, required: true, min: 1 },
  // Empty/missing testIds denotes legacy full-library access.
  testIds: { type: [String], default: undefined },
  status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },
  paidAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.models.SatSubscriptionPayment
  || mongoose.model("SatSubscriptionPayment", paymentSchema);

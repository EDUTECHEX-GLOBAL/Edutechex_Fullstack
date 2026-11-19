const mongoose = require("mongoose");

// Individual availability slot: a specific date + time window that a counselor has opened
const availabilitySlotSchema = new mongoose.Schema({
  date:        { type: String, required: true },        // "YYYY-MM-DD" in IST
  startTime:   { type: String, required: true },        // "HH:MM" 24-h IST
  endTime:     { type: String, required: true },        // "HH:MM" 24-h IST (startTime + 30 min)
  isBooked:    { type: Boolean, default: false },
  bookedByStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", default: null },
}, { _id: true });

const counselorSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true, maxlength: 100 },
  email:        { type: String, required: true, trim: true, lowercase: true, unique: true },
  specialization: { type: String, trim: true, default: "SAT Counseling" },
  bio:          { type: String, trim: true, maxlength: 500 },
  avatarInitials: { type: String, trim: true, maxlength: 3 },

  // Working schedule (defaults): days and hours the counselor is generally available
  availableDays: {
    type: [String],
    // "Monday", "Tuesday", …, "Sunday"
    default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  },
  workingHours: {
    start: { type: String, default: "09:00" }, // "HH:MM" IST
    end:   { type: String, default: "17:00" }, // "HH:MM" IST
  },

  // Explicit 30-min slot inventory set by admin
  availability: { type: [availabilitySlotSchema], default: [] },

  // Dates where the counselor is entirely unavailable (ISO date strings "YYYY-MM-DD")
  blockedDates: { type: [String], default: [] },

  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
    index: true,
  },

  // Admin role flag — counselors with this flag can manage their own slots via the admin UI
  isAdmin: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.models.Counselor
  || mongoose.model("Counselor", counselorSchema);


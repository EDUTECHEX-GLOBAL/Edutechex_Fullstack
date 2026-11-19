const Counselor = require("../models/counselorModel");
const CounselingBooking = require("../models/counselingBookingModel");
const { getAuthenticatedStudent } = require("../services/studentAuth");
const { isSuperAdminEmail } = require("../services/adminAccess");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function isValidTime(t) {
  return typeof t === "string" && /^\d{2}:\d{2}$/.test(t);
}

function isValidDate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

function getBookingLocalDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.BOOKING_TIME_ZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function isFutureBookingSlot(date, startTime) {
  const now = getBookingLocalDateTime();
  return date > now.date || (date === now.date && startTime > now.time);
}

/** Add 30 minutes to an "HH:MM" string. Returns "HH:MM". */
function addThirtyMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + 30;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function removeOverlappingSlots(slots) {
  const byStart = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const result = [];
  let lastEnd = "";

  for (const slot of byStart) {
    if (!isValidTime(slot.startTime) || !isValidTime(slot.endTime)) continue;
    if (lastEnd && slot.startTime < lastEnd) continue;
    result.push(slot);
    lastEnd = slot.endTime;
  }

  return result;
}

/** Minimal admin-check: request must carry an auth token from a counselor with isAdmin=true. */
async function requireAdmin(request, send) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Authentication required." });
    return null;
  }
  // For admin endpoints, we look up a Counselor record by email
  const counselor = await Counselor.findOne({ email: identity.email, status: "active" }).lean();
  if (!counselor || !counselor.isAdmin) {
    send(403, { error: "Admin or counselor access required." });
    return null;
  }
  return { identity, counselor, isSuperAdmin: isSuperAdminEmail(identity.email) };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/counselors  — list all active counselors (student-facing)
// ─────────────────────────────────────────────────────────────────────────────
async function listCounselors(request, send) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in to view counselors." });
    return;
  }
  const counselors = await Counselor.find({ status: "active" })
    .select("name email specialization bio avatarInitials availableDays workingHours")
    .lean();
  send(200, { success: true, counselors });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/counselors  — create a new counselor (admin only)
// ─────────────────────────────────────────────────────────────────────────────
async function createCounselor(request, readJson, send) {
  const admin = await requireAdmin(request, send);
  if (!admin) return;

  let body;
  try { body = await readJson(request); }
  catch (e) { send(400, { error: e.message }); return; }

  const { name, email, specialization, bio, availableDays, workingHours, isAdmin: makeAdmin } = body;
  if (!name || !email) {
    send(400, { error: "Name and email are required." });
    return;
  }

  try {
    const counselor = await Counselor.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      specialization: specialization || "SAT Counseling",
      bio: bio || "",
      avatarInitials: String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase(),
      availableDays: Array.isArray(availableDays) ? availableDays : ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      workingHours: workingHours || { start: "09:00", end: "17:00" },
      isAdmin: Boolean(makeAdmin),
    });
    send(201, { success: true, counselor });
  } catch (err) {
    if (err.code === 11000) {
      send(409, { error: "A counselor with this email already exists." });
    } else {
      send(500, { error: "Could not create counselor." });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/counselors/:id  — update a counselor (admin only)
// ─────────────────────────────────────────────────────────────────────────────
async function updateCounselor(request, counselorId, readJson, send) {
  const admin = await requireAdmin(request, send);
  if (!admin) return;

  let body;
  try { body = await readJson(request); }
  catch (e) { send(400, { error: e.message }); return; }

  const allowed = ["name", "email", "specialization", "bio", "availableDays", "workingHours", "blockedDates", "status", "isAdmin"];
  const update = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const counselor = await Counselor.findByIdAndUpdate(counselorId, { $set: update }, { new: true, runValidators: true }).lean();
  if (!counselor) {
    send(404, { error: "Counselor not found." });
    return;
  }
  send(200, { success: true, counselor });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/counselors/:id/available-slots?date=YYYY-MM-DD
// Returns 30-min slots for the given date that are not yet booked.
// ─────────────────────────────────────────────────────────────────────────────
async function getAvailableSlots(request, counselorId, url, send) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in to view available slots." });
    return;
  }

  const dateParam = url.searchParams.get("date");
  if (!dateParam || !isValidDate(dateParam)) {
    send(400, { error: "Provide a valid date in YYYY-MM-DD format." });
    return;
  }

  const counselor = await Counselor.findOne({ _id: counselorId, status: "active" }).lean();
  if (!counselor) {
    send(404, { error: "Counselor not found." });
    return;
  }

  // Check if date is blocked
  if (counselor.blockedDates && counselor.blockedDates.includes(dateParam)) {
    send(200, { success: true, slots: [], message: "Counselor is unavailable on this date." });
    return;
  }

  // All explicitly opened slots for the requested date
  const explicitSlots = (counselor.availability || []).filter(s => s.date === dateParam);

  // Merge with any slots that remain unbooked from explicit set
  // Then subtract already-booked slots from DB
  const bookedSlotTimes = new Set();
  const bookings = await CounselingBooking.find({
    counselorId,
    bookingDate: dateParam,
    bookingStatus: { $nin: ["cancelled"] },
  }).select("startTime").lean();
  bookings.forEach(b => bookedSlotTimes.add(b.startTime));

  let availableSlots;
  if (explicitSlots.length > 0) {
    // Use admin-defined slots
    availableSlots = removeOverlappingSlots(explicitSlots
      .filter(s => isFutureBookingSlot(s.date, s.startTime))
      .map(s => ({
        _id: s._id,
        startTime: s.startTime,
        endTime: s.endTime,
        date: s.date,
        isBooked: Boolean(s.isBooked || bookedSlotTimes.has(s.startTime)),
      })));
  } else {
    // Auto-generate from working hours if the day is in availableDays
    const dayName = new Date(dateParam + "T12:00:00+05:30").toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Kolkata" });
    if (!counselor.availableDays.includes(dayName)) {
      send(200, { success: true, slots: [], message: "Counselor does not work on this day." });
      return;
    }

    // Generate 30-min slots for office windows: 10:00 AM - 1:15 PM and 2:15 PM - 6:30 PM
    const scheduleTemplate = [
      // Morning shift: 10:00 AM to 1:15 PM
      ["10:00", "10:30"],
      ["10:30", "11:00"],
      ["11:00", "11:30"],
      ["11:30", "12:00"],
      ["12:00", "12:30"],
      ["12:30", "13:00"],
      // Afternoon / Evening shift: 2:15 PM to 6:30 PM
      ["14:15", "14:45"],
      ["14:45", "15:15"],
      ["15:15", "15:45"],
      ["15:45", "16:15"],
      ["16:15", "16:45"],
      ["16:45", "17:15"],
      ["17:15", "17:45"],
      ["18:00", "18:30"],
    ];

    const slots = [];
    for (const [st, et] of scheduleTemplate) {
      if (isFutureBookingSlot(dateParam, st)) {
        slots.push({ startTime: st, endTime: et, date: dateParam, isBooked: bookedSlotTimes.has(st) });
      }
    }
    availableSlots = slots;
  }

  send(200, { success: true, slots: availableSlots });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/counselors/:id/availability  — admin adds explicit slots
// Body: { slots: [{ date, startTime }] }
// ─────────────────────────────────────────────────────────────────────────────
async function addAvailabilitySlots(request, counselorId, readJson, send) {
  const admin = await requireAdmin(request, send);
  if (!admin) return;

  let body;
  try { body = await readJson(request); }
  catch (e) { send(400, { error: e.message }); return; }

  const { slots } = body;
  if (!Array.isArray(slots) || slots.length === 0) {
    send(400, { error: "Provide an array of slots with date and startTime." });
    return;
  }

  const counselor = await Counselor.findById(counselorId);
  if (!counselor) {
    send(404, { error: "Counselor not found." });
    return;
  }

  for (const s of slots) {
    if (!isValidDate(s.date) || !isValidTime(s.startTime)) continue;
    const endTime = addThirtyMinutes(s.startTime);
    // Skip if slot already exists
    const exists = counselor.availability.some(a => a.date === s.date && a.startTime === s.startTime);
    if (!exists) {
      counselor.availability.push({ date: s.date, startTime: s.startTime, endTime });
    }
  }

  await counselor.save();
  send(200, { success: true, availability: counselor.availability });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/counselors/:id/availability  — admin views all slots for counselor
// ─────────────────────────────────────────────────────────────────────────────
async function getAvailability(request, counselorId, send) {
  const admin = await requireAdmin(request, send);
  if (!admin) return;

  const counselor = await Counselor.findById(counselorId).select("name availability blockedDates").lean();
  if (!counselor) {
    send(404, { error: "Counselor not found." });
    return;
  }
  send(200, { success: true, counselorId, name: counselor.name, availability: counselor.availability, blockedDates: counselor.blockedDates });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/counselors/:id/availability/:slotId  — admin removes a slot
// ─────────────────────────────────────────────────────────────────────────────
async function deleteAvailabilitySlot(request, counselorId, slotId, send) {
  const admin = await requireAdmin(request, send);
  if (!admin) return;

  const counselor = await Counselor.findById(counselorId);
  if (!counselor) {
    send(404, { error: "Counselor not found." });
    return;
  }

  const slotIndex = counselor.availability.findIndex(s => String(s._id) === slotId);
  if (slotIndex === -1) {
    send(404, { error: "Slot not found." });
    return;
  }

  if (counselor.availability[slotIndex].isBooked) {
    send(409, { error: "Cannot delete a slot that is already booked. Cancel the booking first." });
    return;
  }

  counselor.availability.splice(slotIndex, 1);
  await counselor.save();
  send(200, { success: true, message: "Slot deleted." });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: GET /api/admin/counseling/bookings — all bookings for counselor dashboard
// ─────────────────────────────────────────────────────────────────────────────
async function adminGetAllBookings(request, url, send) {
  const admin = await requireAdmin(request, send);
  if (!admin) return;

  const status = url.searchParams.get("status") || "";
  const filter = admin.isSuperAdmin
    ? {}
    : { counselorId: admin.counselor._id };
  if (admin.isSuperAdmin && url.searchParams.get("counselorId")) {
    const counselorId = url.searchParams.get("counselorId");
    if (!/^[a-f\d]{24}$/i.test(counselorId)) return send(400, { error: "Invalid counselorId filter." });
    filter.counselorId = counselorId;
  }
  if (status && status !== "all") filter.bookingStatus = status;

  const bookings = await CounselingBooking.find(filter)
    .sort({ bookingDate: 1, startTime: 1 })
    .lean();
  send(200, { success: true, count: bookings.length, bookings });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: PATCH /api/admin/counseling/:bookingId/status
// ─────────────────────────────────────────────────────────────────────────────
async function adminUpdateBookingStatus(request, bookingId, readJson, send) {
  const admin = await requireAdmin(request, send);
  if (!admin) return;

  let body;
  try { body = await readJson(request); }
  catch (e) { send(400, { error: e.message }); return; }

  const { status, notes } = body;
  const allowed = ["confirmed", "completed", "cancelled", "no_show"];
  if (!allowed.includes(status)) {
    send(400, { error: `Status must be one of: ${allowed.join(", ")}.` });
    return;
  }

  const update = { bookingStatus: status };
  if (notes) update.counselorNotes = String(notes).trim();
  if (status === "completed") update.completedAt = new Date();
  if (status === "cancelled") {
    update.cancelledAt = new Date();
    update.cancelledBy = "counselor";
  }

  const booking = await CounselingBooking.findByIdAndUpdate(bookingId, { $set: update }, { new: true });
  if (!booking) {
    send(404, { error: "Booking not found." });
    return;
  }

  // If cancelled, free up the slot in the counselor's availability
  if (status === "cancelled") {
    await Counselor.updateOne(
      { _id: booking.counselorId, "availability.date": booking.bookingDate, "availability.startTime": booking.startTime },
      { $set: { "availability.$.isBooked": false, "availability.$.bookedByStudentId": null } }
    );
  }

  send(200, { success: true, booking });
}

module.exports = {
  listCounselors,
  createCounselor,
  updateCounselor,
  getAvailableSlots,
  addAvailabilitySlots,
  getAvailability,
  deleteAvailabilitySlot,
  adminGetAllBookings,
  adminUpdateBookingStatus,
};


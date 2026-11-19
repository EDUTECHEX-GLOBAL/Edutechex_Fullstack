const {
  listCounselors,
  createCounselor,
  updateCounselor,
  getAvailableSlots,
  addAvailabilitySlots,
  getAvailability,
  deleteAvailabilitySlot,
  adminGetAllBookings,
  adminUpdateBookingStatus,
} = require("../controllers/counselorController");

const {
  getCounselingEligibility,
  bookCounseling,
  verifyBookingPayment,
  getMyBookings,
  getBookingById,
  cancelBooking,
  adminResyncBooking,
} = require("../controllers/counselingController");

async function handleCounselingRequest(request, response, url, readJson, send) {
  const wrap = (status, payload) => send(response, status, payload);

  // ── Counselor routes ──────────────────────────────────────────────────────

  // GET /api/counselors
  if (request.method === "GET" && url.pathname === "/api/counselors") {
    await listCounselors(request, wrap);
    return true;
  }

  // POST /api/counselors
  if (request.method === "POST" && url.pathname === "/api/counselors") {
    await createCounselor(request, readJson, wrap);
    return true;
  }

  // PUT /api/counselors/:id
  const counselorUpdateMatch = url.pathname.match(/^\/api\/counselors\/([\w-]+)$/);
  if (request.method === "PUT" && counselorUpdateMatch) {
    await updateCounselor(request, counselorUpdateMatch[1], readJson, wrap);
    return true;
  }

  // GET /api/counselors/:id/available-slots?date=YYYY-MM-DD
  const slotsMatch = url.pathname.match(/^\/api\/counselors\/([\w-]+)\/available-slots$/);
  if (request.method === "GET" && slotsMatch) {
    await getAvailableSlots(request, slotsMatch[1], url, wrap);
    return true;
  }

  // POST /api/counselors/:id/availability
  const availPostMatch = url.pathname.match(/^\/api\/counselors\/([\w-]+)\/availability$/);
  if (request.method === "POST" && availPostMatch) {
    await addAvailabilitySlots(request, availPostMatch[1], readJson, wrap);
    return true;
  }

  // GET /api/counselors/:id/availability
  if (request.method === "GET" && availPostMatch) {
    await getAvailability(request, availPostMatch[1], wrap);
    return true;
  }

  // DELETE /api/counselors/:id/availability/:slotId
  const availDeleteMatch = url.pathname.match(/^\/api\/counselors\/([\w-]+)\/availability\/([\w-]+)$/);
  if (request.method === "DELETE" && availDeleteMatch) {
    await deleteAvailabilitySlot(request, availDeleteMatch[1], availDeleteMatch[2], wrap);
    return true;
  }

  // ── Admin booking management routes ──────────────────────────────────────

  // GET /api/admin/counseling/bookings
  if (request.method === "GET" && url.pathname === "/api/admin/counseling/bookings") {
    await adminGetAllBookings(request, url, wrap);
    return true;
  }

  // PATCH /api/admin/counseling/:bookingId/status
  const adminResyncMatch = url.pathname.match(/^\/api\/admin\/counseling\/([\w-]+)\/resync$/);
  if (request.method === "POST" && adminResyncMatch) {
    await adminResyncBooking(request, adminResyncMatch[1], wrap);
    return true;
  }

  // PATCH /api/admin/counseling/:bookingId/status
  const adminStatusMatch = url.pathname.match(/^\/api\/admin\/counseling\/([\w-]+)\/status$/);
  if (request.method === "PATCH" && adminStatusMatch) {
    await adminUpdateBookingStatus(request, adminStatusMatch[1], readJson, wrap);
    return true;
  }

  // ── Counseling booking routes ─────────────────────────────────────────────

  // GET /api/counseling/eligibility?mockTestId=XX
  if (request.method === "GET" && url.pathname === "/api/counseling/eligibility") {
    await getCounselingEligibility(request, url, wrap);
    return true;
  }

  // POST /api/counseling/book
  if (request.method === "POST" && url.pathname === "/api/counseling/book") {
    await bookCounseling(request, readJson, wrap);
    return true;
  }

  // POST /api/counseling/verify-payment
  if (request.method === "POST" && url.pathname === "/api/counseling/verify-payment") {
    await verifyBookingPayment(request, readJson, wrap);
    return true;
  }

  // GET /api/counseling/my-bookings
  if (request.method === "GET" && url.pathname === "/api/counseling/my-bookings") {
    await getMyBookings(request, wrap);
    return true;
  }

  // GET /api/counseling/:id
  const bookingByIdMatch = url.pathname.match(/^\/api\/counseling\/([\w-]+)$/);
  if (request.method === "GET" && bookingByIdMatch) {
    await getBookingById(request, bookingByIdMatch[1], wrap);
    return true;
  }

  // PATCH /api/counseling/:id/cancel
  const cancelMatch = url.pathname.match(/^\/api\/counseling\/([\w-]+)\/cancel$/);
  if (request.method === "PATCH" && cancelMatch) {
    await cancelBooking(request, cancelMatch[1], readJson, wrap);
    return true;
  }

  return false;
}

module.exports = { handleCounselingRequest };


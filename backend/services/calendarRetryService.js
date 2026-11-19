const CounselingBooking = require("../models/counselingBookingModel");
const { isCalendarConnected, syncBookingToGoogleCalendar } = require("./googleCalendarService");
const { sendCounselingBookingConfirmation } = require("./emailService");

function nowInBookingZone() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.BOOKING_TIME_ZONE || "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

let running = false;
async function retryFailedCalendarBookings() {
  if (running) return;
  running = true;
  let attempted = 0;
  let synced = 0;
  let emailed = 0;
  let failed = 0;
  try {
    if (!await isCalendarConnected()) {
      console.log("Calendar retry: skipped (shared Google Calendar is not connected).");
      return;
    }
    const now = nowInBookingZone();
    const bookings = await CounselingBooking.find({
      bookingStatus: "confirmed",
      $or: [
        { bookingDate: { $gt: now.date } },
        { bookingDate: now.date, startTime: { $gt: now.time } },
      ],
      calendarSyncStatus: { $in: ["sync_failed", null] },
    }).sort({ bookingDate: 1, startTime: 1 }).limit(20);
    attempted = bookings.length;
    for (const booking of bookings) {
      const result = await syncBookingToGoogleCalendar(booking, { silent: true });
      if (!result.success) { failed += 1; continue; }
      synced += 1;
      if (!booking.meetingLink) continue;
      try {
        await sendCounselingBookingConfirmation(booking);
        booking.counselingConfirmationEmailSentAt = new Date();
        await booking.save();
        emailed += 1;
      } catch (error) {
        console.error("Calendar retry confirmation email failed:", error.message);
      }
    }
    console.log(`Calendar retry: attempted=${attempted}, synced=${synced}, failed=${failed}, emailed=${emailed}.`);
  } catch (error) {
    console.error(`Calendar retry failed: ${error.message}`);
  } finally {
    running = false;
  }
}

function startCalendarRetryJob() {
  const timer = setInterval(retryFailedCalendarBookings, 5 * 60 * 1000);
  timer.unref?.();
  return timer;
}

module.exports = { startCalendarRetryJob, retryFailedCalendarBookings };

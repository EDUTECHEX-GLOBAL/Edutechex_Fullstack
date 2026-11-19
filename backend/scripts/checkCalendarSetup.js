const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Counselor = require("../models/counselorModel");
const Credential = require("../models/googleCalendarCredentialModel");
const CounselingBooking = require("../models/counselingBookingModel");

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing from backend/.env.");
  await mongoose.connect(process.env.MONGO_URI);
  const [counselors, credential, failedBookings] = await Promise.all([
    Counselor.find({}, "email isAdmin status").sort({ email: 1 }).lean(),
    Credential.findOne({ key: "shared" }).select("connectedBy connectedAt").lean(),
    CounselingBooking.countDocuments({ calendarSyncStatus: "sync_failed" }),
  ]);
  console.log("Counselors:");
  for (const counselor of counselors) console.log(`- ${counselor.email || "(no email)"} | isAdmin=${Boolean(counselor.isAdmin)} | status=${counselor.status || "unknown"}`);
  console.log(`Shared Google Calendar credential exists: ${Boolean(credential)}`);
  console.log(`Connected by: ${credential?.connectedBy || "(not connected)"}`);
  console.log(`Connected at: ${credential?.connectedAt ? credential.connectedAt.toISOString() : "(not connected)"}`);
  console.log(`Bookings with calendarSyncStatus=sync_failed: ${failedBookings}`);
}

main().catch((error) => {
  console.error("Calendar setup check failed:", error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});

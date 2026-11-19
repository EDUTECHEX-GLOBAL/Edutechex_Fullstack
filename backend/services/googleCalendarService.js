const { google } = require("googleapis");
const { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } = require("node:crypto");
const Credential = require("../models/googleCalendarCredentialModel");

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

function getRedirectUri() {
  const backendUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "");
  const redirectPath = process.env.GOOGLE_REDIRECT_PATH || "/api/calendar/oauth/call";
  if (!redirectPath.startsWith("/") || redirectPath.startsWith("//") || /[?#]/.test(redirectPath)) {
    const error = new Error("GOOGLE_REDIRECT_PATH must be a path beginning with one slash and contain no query or fragment."); error.status = 503; throw error;
  }
  return `${backendUrl}${redirectPath}`;
}

function oauthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    const error = new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in the backend environment."); error.status = 503; throw error;
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, getRedirectUri());
}

function encryptionKey() {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) {
    const error = new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key."); error.status = 503; throw error;
  }
  return Buffer.from(value, "hex");
}
function encrypt(value) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
function decrypt(value) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}
function createState(email, flow = "admin") {
  if (!process.env.JWT_SECRET) { const error = new Error("JWT_SECRET is required for secure Google OAuth state."); error.status = 503; throw error; }
  const payload = Buffer.from(JSON.stringify({ email: String(email).trim().toLowerCase(), flow, exp: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const sig = createHmac("sha256", process.env.JWT_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifyState(state) {
  if (!process.env.JWT_SECRET || typeof state !== "string") return null;
  const [payload, signature] = state.split("."); if (!payload || !signature) return null;
  const expected = createHmac("sha256", process.env.JWT_SECRET).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { const data = JSON.parse(Buffer.from(payload, "base64url").toString()); return data.exp > Date.now() ? data : null; } catch { return null; }
}
async function saveTokens(tokens, email) {
  const existing = await Credential.findOne({ key: "shared" }).select("+encryptedTokens");
  const previous = existing?.encryptedTokens ? decrypt(existing.encryptedTokens) : {};
  const merged = { ...previous, ...tokens };
  await Credential.findOneAndUpdate({ key: "shared" }, {
    $set: { encryptedTokens: encrypt(merged), connectedBy: email, ...(tokens.refresh_token ? { connectedAt: new Date() } : {}) },
  }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
}
async function getClient() {
  const credential = await Credential.findOne({ key: "shared" }).select("+encryptedTokens");
  if (!credential) { const error = new Error("Google Calendar has not been connected by an admin."); error.status = 503; throw error; }
  const client = oauthClient(); client.setCredentials(decrypt(credential.encryptedTokens));
  client.on("tokens", (tokens) => saveTokens(tokens, credential.connectedBy).catch((e) => console.error("Could not persist refreshed Google tokens:", e.message)));
  return client;
}
async function getCalendar() {
  const auth = await getClient();
  return { auth, calendar: google.calendar({ version: "v3", auth }), calendarId: process.env.GOOGLE_CALENDAR_ID || "primary" };
}
async function isCalendarConnected() {
  return Boolean(await Credential.exists({ key: "shared" }));
}
function eventTime(booking, time) {
  return { dateTime: `${booking.bookingDate}T${time}:00`, timeZone: process.env.BOOKING_TIME_ZONE || "Asia/Kolkata" };
}
function zonedIso(date, time) {
  const timeZone = process.env.BOOKING_TIME_ZONE || "Asia/Kolkata";
  const wall = `${date}T${time}:00`;
  const target = Date.parse(`${wall}Z`);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(target));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
  const offset = Math.round((localAsUtc - target) / 60000);
  const absolute = Math.abs(offset);
  return `${wall}${offset < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
async function syncBookingToGoogleCalendar(booking, options = {}) {
  try {
    const { calendar, calendarId } = await getCalendar();
    const timeMin = zonedIso(booking.bookingDate, booking.startTime);
    const timeMax = zonedIso(booking.bookingDate, booking.endTime);
    let existingEventId = booking.googleCalendarEventId;
    const summary = `EduTechEx Counseling with ${booking.counselorName || "Counsellor"}`;
    if (!existingEventId) {
      const matches = await calendar.events.list({ calendarId, timeMin, timeMax, singleEvents: true, q: "EduTechEx Counseling" });
      const match = (matches.data.items || []).find((event) => event.summary === summary
        && Date.parse(event.start?.dateTime || "") === Date.parse(timeMin)
        && Date.parse(event.end?.dateTime || "") === Date.parse(timeMax));
      existingEventId = match?.id || null;
    }
    if (!existingEventId) {
      const availability = await calendar.freebusy.query({ requestBody: {
        timeMin,
        timeMax,
        timeZone: process.env.BOOKING_TIME_ZONE || "Asia/Kolkata",
        items: [{ id: calendarId }],
      } });
      if (availability.data.calendars?.[calendarId]?.busy?.length) throw new Error("This time overlaps an existing event on the shared Google Calendar.");
    }
    const eventBody = {
      summary,
      description: `EduTechEx counseling session${booking.mockTestTitle ? ` for ${booking.mockTestTitle}` : ""}. Student: ${booking.studentName || ""} (${booking.studentEmail}).`,
      start: eventTime(booking, booking.startTime),
      end: eventTime(booking, booking.endTime),
      attendees: [booking.studentEmail, booking.counselorEmail].filter(Boolean).map((email) => ({ email })),
    };
    const meetEnabled = String(process.env.GOOGLE_MEET_ENABLED).toLowerCase() === "true";
    if (meetEnabled) eventBody.conferenceData = { createRequest: { requestId: randomBytes(16).toString("hex"), conferenceSolutionKey: { type: "hangoutsMeet" } } };
    const params = { calendarId, requestBody: eventBody, sendUpdates: "all", ...(meetEnabled ? { conferenceDataVersion: 1 } : {}) };
    let response;
    if (existingEventId) {
      try { response = await calendar.events.patch({ ...params, eventId: existingEventId }); }
      catch (error) { if (error.code !== 404 && error.status !== 404) throw error; }
    }
    if (!response) response = await calendar.events.insert(params);
    let event = response.data;
    if (meetEnabled && !event.hangoutLink && event.id) {
      for (let attempt = 0; attempt < 4 && !event.hangoutLink; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const refreshed = await calendar.events.get({ calendarId, eventId: event.id });
        event = refreshed.data;
      }
    }
    booking.googleCalendarEventId = event.id || booking.googleCalendarEventId || null;
    booking.googleCalendarEventUrl = event.htmlLink || null;
    booking.meetingLink = event.hangoutLink || event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri || null;
    if (meetEnabled && !booking.meetingLink) throw new Error("Google Calendar created the event, but the Google Meet link is still pending. Retry the calendar sync shortly.");
    booking.calendarSyncStatus = "synced";
    await booking.save();
    return { success: true, meetingLink: booking.meetingLink, eventUrl: booking.googleCalendarEventUrl };
  } catch (error) {
    if (!options.silent) console.error("Counseling booking Calendar sync failed:", error.message);
    booking.calendarSyncStatus = "sync_failed";
    await booking.save().catch((saveError) => console.error("Could not save calendar sync failure:", saveError.message));
    return { success: false, error: error.message, meetingLink: null };
  }
}

module.exports = { oauthClient, getRedirectUri, CALENDAR_SCOPE, createState, verifyState, saveTokens, getCalendar, isCalendarConnected, syncBookingToGoogleCalendar };

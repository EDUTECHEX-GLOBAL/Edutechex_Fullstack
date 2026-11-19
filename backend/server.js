const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const http = require("node:http");
const mongoose = require("mongoose");
const { handleSatRequest } = require("./routes/satRoutes");
const { handleMockRequest } = require("./routes/mockroutes");
const { handlePayRequest } = require("./routes/payroutes");
const { handleCounselingRequest } = require("./routes/counselingRoutes");
const { handleCalendarRequest } = require("./routes/calendarRoutes");
const { getRedirectUri, isCalendarConnected } = require("./services/googleCalendarService");
const { startCalendarRetryJob, retryFailedCalendarBookings } = require("./services/calendarRetryService");

const PORT = Number(process.env.PORT || 5000);
const MAX_BODY_BYTES = 16 * 1024;
// NEW: Razorpay webhook payloads can be larger than 16 KB. The signature check
// needs the complete raw body, so the webhook path gets a higher limit.
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// Startup env check (prints set/MISSING only, never the secret values)
console.log("ENV file:", path.join(__dirname, ".env"));
for (const name of ["MONGO_URI", "BREVO_SMTP_USER", "BREVO_SMTP_KEY", "EMAIL_FROM", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
  console.log(`  ${name}: ${process.env[name] ? "set" : "MISSING"}`);
}
console.log(`  OTP_SECRET/JWT_SECRET: ${process.env.OTP_SECRET || process.env.JWT_SECRET ? "set" : "MISSING"}`);
console.log(`  SAT_SUBSCRIPTION_AMOUNT_PAISE: ${process.env.SAT_SUBSCRIPTION_AMOUNT_PAISE ? "set" : "MISSING"}`);
console.log(`  SAT_SUBSCRIPTION_DURATION_DAYS: ${process.env.SAT_SUBSCRIPTION_DURATION_DAYS ? "set" : "MISSING"}`);
console.log(`  BREVO_SMTP_HOST: ${process.env.BREVO_SMTP_HOST || "(default smtp-relay.brevo.com)"}`);
console.log(`  LOGO_SOURCE: ${process.env.LOGO_URL ? process.env.LOGO_URL : "inline CID attachment (backend/assets/edutech-logo.png)"}`);
try { console.log(`  GOOGLE_REDIRECT_URI: ${getRedirectUri()}`); }
catch (error) { console.log(`  GOOGLE_REDIRECT_URI: unavailable (${error.message})`); }

function send(response, status, payload) {
  if (response.headersSent) return;
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  const limit = (request.url || "").split("?")[0].endsWith("/pay/webhook")
    ? MAX_WEBHOOK_BODY_BYTES
    : MAX_BODY_BYTES;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;

    request.on("data", (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > limit) {
        finished = true;
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (finished) return;
      finished = true;
      try {
        request.rawBody = Buffer.concat(chunks);
        resolve(JSON.parse(request.rawBody.toString("utf8") || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", (error) => {
      if (finished) return;
      finished = true;
      reject(error);
    });
  });
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      send(response, 200, {
        status: "ok",
        service: "edutechex-backend",
        mongo: mongoose.connection.readyState === 1 ? "connected" : "not connected",
      });
      return;
    }

    let handled = await handleSatRequest(request, response, url, readJson, send);
    if (!handled) {
      handled = await handleMockRequest(request, response, url, readJson, send);
    }
    if (!handled) {
      handled = await handlePayRequest(request, response, url, readJson, send);
    }
    if (!handled) {
      handled = await handleCounselingRequest(request, response, url, readJson, send);
    }
    if (!handled) {
      handled = await handleCalendarRequest(request, response, url, readJson, send);
    }
    if (!handled) send(response, 404, { error: "Route not found." });
  } catch (error) {
    const status = error.status || 500;
    console.error(`[${request.method} ${request.url}] ${status}:`, error.message);
    send(response, status, {
      error: status >= 500 ? "A server error occurred. Please try again." : (error.message || "Request failed."),
    });
  }
});

async function start() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI is missing. Add it to backend/.env.");

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log("MongoDB connected.");

  // Ensure the configured admin counselor exists and remains authorized.
  try {
    const Counselor = require("./models/counselorModel");
    const adminEmail = (process.env.ADMIN_COUNSELOR_EMAIL || "adityacv@edutechex.com").trim().toLowerCase();
    await Counselor.findOneAndUpdate({ email: adminEmail }, {
      $set: { isAdmin: true, status: "active" },
      $setOnInsert: {
        name: "Aditya Cherikuri",
        specialization: "Director of Academics & Admissions · SAT Counseling",
        bio: "Lead counselor for undergraduate admissions and SAT preparation. Personalized guidance on score improvement, test strategies, and college roadmap.",
        avatarInitials: "AC",
        availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        workingHours: { start: "10:00", end: "18:30" },
      },
    }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
    console.log("Admin counselor ensured.");
  } catch (cErr) {
    console.error("Counselor seed check failed:", cErr.message);
  }

  try {
    console.log(await isCalendarConnected()
      ? "Google Calendar: connected"
      : "Google Calendar: NOT connected - run Connect Google Calendar in admin");
  } catch (error) { console.error("Google Calendar connection check failed:", error.message); }
  startCalendarRetryJob();
  void retryFailedCalendarBookings();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`EduTechEx backend listening on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Startup failed:", error.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));

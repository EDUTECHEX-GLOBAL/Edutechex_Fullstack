const path = require("node:path");
const { execFile } = require("node:child_process");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Credential = require("../models/googleCalendarCredentialModel");
const { oauthClient, CALENDAR_SCOPE, createState } = require("../services/googleCalendarService");

const CONNECT_EMAIL = (process.env.GOOGLE_CONNECT_EMAIL || "developers.doc@edutechex.com").trim().toLowerCase();
const CONNECT_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = "rundll32.exe";
    args = ["url.dll,FileProtocolHandler", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  execFile(command, args, { windowsHide: true }, (error) => {
    if (error) console.log("Could not open a browser automatically; open the authorization URL printed above.");
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing from backend/.env.");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const previous = await Credential.findOne({ key: "shared" }).select("connectedAt").lean();
  const previousConnectedAt = previous?.connectedAt ? new Date(previous.connectedAt).getTime() : 0;
  const state = createState(CONNECT_EMAIL, "cli");
  const authorizationUrl = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [CALENDAR_SCOPE],
    state,
  });

  console.log("Start the backend server first; Google redirects to its OAuth callback.");
  console.log("Open this Google authorization URL:");
  console.log(authorizationUrl);
  openBrowser(authorizationUrl);

  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const credential = await Credential.findOne({ key: "shared" }).select("connectedBy connectedAt").lean();
    const connectedAt = credential?.connectedAt ? new Date(credential.connectedAt).getTime() : 0;
    if (credential && connectedAt > previousConnectedAt) {
      console.log(`Google Calendar connected by ${credential.connectedBy || CONNECT_EMAIL} at ${new Date(connectedAt).toISOString()}`);
      return;
    }
    await delay(POLL_INTERVAL_MS);
  }

  console.error("Google Calendar connection timed out after 3 minutes. Complete Google consent in the browser and retry the script.");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Google Calendar connection script failed:", error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});

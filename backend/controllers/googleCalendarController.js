const Counselor = require("../models/counselorModel");
const Credential = require("../models/googleCalendarCredentialModel");
const { getAuthenticatedStudent } = require("../services/studentAuth");
const { isSuperAdminEmail } = require("../services/adminAccess");
const { oauthClient, CALENDAR_SCOPE, createState, verifyState, saveTokens } = require("../services/googleCalendarService");

function googleConnectEmail() {
  return (process.env.GOOGLE_CONNECT_EMAIL || "developers.doc@edutechex.com").trim().toLowerCase();
}

async function getSuperAdmin(request) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) return { error: "Authentication required.", status: 401 };
  if (!isSuperAdminEmail(identity.email)) return { error: "Super-admin access required.", status: 403 };
  const admin = await Counselor.findOne({ email: identity.email, status: "active", isAdmin: true }).lean();
  return admin ? { admin, identity } : { error: "An active admin counselor account is required.", status: 403 };
}
function frontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
}
function redirect(response, query, reason) {
  const params = new URLSearchParams({ calendar: query });
  if (reason) params.set("reason", reason);
  response.writeHead(302, { Location: `${frontendUrl()}/sat/admin/counseling?${params.toString()}` });
  response.end();
}
function htmlResult(response, statusCode, message) {
  const safeMessage = String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Google Calendar connection</title></head><body><p>${safeMessage}</p></body></html>`);
}

async function authorize(request, send) {
  const access = await getSuperAdmin(request);
  if (access.error) return send(access.status, { error: access.error });
  try {
    const authorizationUrl = oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [CALENDAR_SCOPE], state: createState(access.identity.email, "admin") });
    return send(200, { success: true, authorizationUrl });
  } catch (error) { return send(error.status || 503, { error: error.message }); }
}

async function callback(request, response, url, send) {
  const state = verifyState(url.searchParams.get("state"));
  if (!state) return send(400, { error: "OAuth state is invalid or expired." });

  const cliFlow = state.flow === "cli" && state.email === googleConnectEmail();
  if (cliFlow) {
    // The one-time CLI flow is signed by the backend and restricted to the configured
    // Google account; normal/admin OAuth callbacks still require a super-admin record.
  } else {
    if (!isSuperAdminEmail(state.email)) return redirect(response, "error");
    const admin = await Counselor.findOne({ email: state.email, status: "active", isAdmin: true }).lean();
    if (!admin) return redirect(response, "error");
  }

  if (url.searchParams.has("error") || !url.searchParams.get("code")) {
    const googleError = url.searchParams.get("error");
    if (googleError) console.error("Google OAuth callback failed:", googleError);
    if (cliFlow) return htmlResult(response, 400, "Google authorization was not completed. You can close this tab and retry the connection script.");
    return redirect(response, "error");
  }

  try {
    const result = await oauthClient().getToken(url.searchParams.get("code"));
    if (!result.tokens.refresh_token) {
      const message = "Google did not return a refresh token. Revoke EduTechEx access at https://myaccount.google.com/permissions, then run the connection flow again and approve access.";
      console.error("Google OAuth callback failed: Google did not return a refresh token.");
      if (cliFlow) return htmlResult(response, 400, message);
      return redirect(response, "error", "no_refresh_token");
    }
    await saveTokens(result.tokens, state.email);
    if (cliFlow) return htmlResult(response, 200, "Google Calendar connected. You can close this tab.");
    return redirect(response, "connected");
  } catch (error) {
    console.error("Google OAuth callback failed:", error.message);
    if (cliFlow) return htmlResult(response, 502, "Google Calendar connection failed. Check the backend logs and retry.");
    return redirect(response, "error");
  }
}

async function status(request, send) {
  const access = await getSuperAdmin(request);
  if (access.error) return send(access.status, { error: access.error });
  const credential = await Credential.findOne({ key: "shared" }).select("connectedBy connectedAt").lean();
  return send(200, { isSuperAdmin: true, connected: Boolean(credential), connectedBy: credential?.connectedBy || null, connectedAt: credential?.connectedAt || null });
}

module.exports = { authorize, callback, status };

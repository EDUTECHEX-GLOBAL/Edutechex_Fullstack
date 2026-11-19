const { createHmac, timingSafeEqual } = require("node:crypto");

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function signingSecret() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required for SAT student sessions.");
  return process.env.JWT_SECRET;
}

function sign(value) {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function createStudentToken(registration) {
  const payload = Buffer.from(JSON.stringify({
    sub: String(registration.id || registration._id),
    email: String(registration.email).trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })).toString("base64url");
  const unsigned = `sat.${payload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

function getAuthenticatedStudent(request) {
  const header = request.headers?.authorization || "";
  const match = header.match(/^Bearer\s+sat\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match) return null;

  const unsigned = `sat.${match[1]}`;
  const expected = Buffer.from(sign(unsigned));
  const received = Buffer.from(match[2]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    if (!payload.sub || !payload.email || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    return { id: String(payload.sub), email: String(payload.email).trim().toLowerCase() };
  } catch {
    return null;
  }
}

module.exports = { createStudentToken, getAuthenticatedStudent };

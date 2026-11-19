const oauth = require("../controllers/googleCalendarController");

async function handleCalendarRequest(request, response, url, readJson, send) {
  const reply = (status, payload) => send(response, status, payload);
  if (request.method === "GET" && url.pathname === "/api/calendar/oauth/authorize") { await oauth.authorize(request, reply); return true; }
  if (request.method === "GET" && url.pathname === "/api/calendar/oauth/call") { await oauth.callback(request, response, url, reply); return true; }
  if (request.method === "GET" && url.pathname === "/api/calendar/oauth/status") { await oauth.status(request, reply); return true; }
  return false;
}

module.exports = { handleCalendarRequest };

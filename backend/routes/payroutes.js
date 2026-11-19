const {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  handleSubscriptionWebhook,
  getStudentSubscription,
  getSubscriptionPricing,
} = require("../controllers/paycontroller");

async function handlePayRequest(request, response, url, readJson, send) {
  if (request.method === "GET" && url.pathname === "/api/pay/pricing") {
    getSubscriptionPricing((status, payload) => send(response, status, payload));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/pay/subscription") {
    await getStudentSubscription(request, (status, payload) => send(response, status, payload));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/pay/create-order") {
    await createSubscriptionOrder(request, readJson, (status, payload) => send(response, status, payload));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/pay/verify-payment") {
    await verifySubscriptionPayment(request, readJson, (status, payload) => send(response, status, payload));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/pay/webhook") {
    await handleSubscriptionWebhook(request, readJson, (status, payload) => send(response, status, payload));
    return true;
  }

  return false;
}

module.exports = { handlePayRequest };

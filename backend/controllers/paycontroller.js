const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const Registration = require("../models/Registration");
const SubscriptionPayment = require("../models/paymodel");
const { getActiveSubscription, getStudentMockAccess } = require("../services/subscriptionService");
const { getAuthenticatedStudent } = require("../services/studentAuth");

const DAY_MS = 24 * 60 * 60 * 1000;

function getPaymentConfig() {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
  const baseAmount = Number(process.env.SAT_SUBSCRIPTION_AMOUNT_PAISE);
  const taxPercent = Number(process.env.SAT_SUBSCRIPTION_TAX_PERCENT || 0);
  const taxAmount = Math.round(baseAmount * taxPercent / 100);
  const amount = baseAmount + taxAmount;
  const durationDays = Number(process.env.SAT_SUBSCRIPTION_DURATION_DAYS);
  const currency = (process.env.SAT_SUBSCRIPTION_CURRENCY || "INR").trim().toUpperCase();

  if (!keyId || !keySecret) {
    const error = new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env.");
    error.status = 503;
    throw error;
  }
  if (!Number.isSafeInteger(baseAmount) || baseAmount < 100) {
    const error = new Error("Set SAT_SUBSCRIPTION_AMOUNT_PAISE to the subscription base price in paise (minimum 100).");
    error.status = 503;
    throw error;
  }
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100 || Math.round(taxPercent * 100) !== taxPercent * 100) {
    const error = new Error("SAT_SUBSCRIPTION_TAX_PERCENT must be a percentage from 0 to 100 with up to two decimal places.");
    error.status = 503;
    throw error;
  }
  if (!Number.isSafeInteger(amount)) {
    const error = new Error("The subscription total is too large.");
    error.status = 503;
    throw error;
  }
  if (!Number.isSafeInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
    const error = new Error("Set SAT_SUBSCRIPTION_DURATION_DAYS to a whole number from 1 to 3650.");
    error.status = 503;
    throw error;
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    const error = new Error("SAT_SUBSCRIPTION_CURRENCY must be a 3-letter currency code.");
    error.status = 503;
    throw error;
  }

  return { keyId, keySecret, amount, baseAmount, taxAmount, taxPercent, durationDays, currency };
}

function pricingDetails(config) {
  return {
    currency: config.currency,
    baseAmount: config.baseAmount,
    taxAmount: config.taxAmount,
    taxPercent: config.taxPercent,
    totalAmount: config.amount,
    isTestMode: Boolean(config.keyId && config.keyId.startsWith("rzp_test_")),
  };
}

function getSubscriptionPricing(send) {
  try {
    const config = getPaymentConfig();
    send(200, { pricing: pricingDetails(config) });
  } catch (error) {
    send(error.status || 500, { error: error.message || "Could not load subscription pricing." });
  }
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = getPaymentConfig();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...options,
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (error) {
    const failure = new Error("Could not reach Razorpay. Please try again.");
    failure.status = 502;
    throw failure;
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Razorpay API request failed:", response.status, result?.error?.code || "unknown_error");
    const failure = new Error("Razorpay could not process this request. Please try again.");
    failure.status = response.status >= 500 ? 502 : 400;
    throw failure;
  }
  return result;
}

function readBody(request, readJson, send) {
  return readJson(request).catch((error) => {
    send(error.message === "Request body must be valid JSON." ? 400 : 413, { error: error.message });
    return null;
  });
}

// NEW: if the student still has an active paid subscription, the new period
// starts when the current one ends, so renewing early never loses remaining days.
async function computeExpiry(studentEmail, durationDays, paidAt) {
  const active = await SubscriptionPayment.findOne({
    studentEmail,
    status: "paid",
    expiresAt: { $gt: paidAt },
  }).sort({ expiresAt: -1 }).select("expiresAt");
  const start = active?.expiresAt ? active.expiresAt.getTime() : paidAt.getTime();
  return new Date(start + durationDays * DAY_MS);
}

const MOCK_PACK_RANGES = [
  { start: 4, end: 14 },
  { start: 15, end: 24 },
  { start: 25, end: 34 },
  { start: 35, end: 44 },
  { start: 45, end: 54 },
  { start: 55, end: 64 },
  { start: 65, end: 74 },
  { start: 75, end: 84 },
  { start: 85, end: 90 },
  { start: 91, end: 100 },
  { start: 101, end: 110 },
  { start: 111, end: 120 },
  { start: 121, end: 130 },
  { start: 131, end: 140 },
  { start: 141, end: 150 },
];

const VALID_MOCK_PACKS = MOCK_PACK_RANGES.map((r) => {
  const ids = [];
  for (let i = r.start; i <= r.end; i++) ids.push(String(i).padStart(2, "0"));
  return ids;
});

function getPurchaseExpiry(record, paidAt) {
  if (Array.isArray(record.testIds) && record.testIds.length > 0) {
    return new Date(paidAt.getTime() + record.durationDays * DAY_MS);
  }
  return computeExpiry(record.studentEmail, record.durationDays, paidAt);
}

async function getOrCreateRazorpayCustomer(student) {
  if (student.razorpayCustomerId) return student.razorpayCustomerId;

  const customer = await razorpayRequest("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: student.name,
      email: student.email,
      contact: String(student.phone || "").replace(/[^\d+]/g, ""),
      fail_existing: "0",
      notes: { registration_id: String(student._id) },
    }),
  });
  if (!customer.id) throw new Error("Razorpay did not return a customer ID.");

  await Registration.updateOne(
    { _id: student._id, $or: [{ razorpayCustomerId: { $exists: false } }, { razorpayCustomerId: null }] },
    { $set: { razorpayCustomerId: customer.id } }
  );
  const stored = await Registration.findById(student._id).select("+razorpayCustomerId");
  return stored?.razorpayCustomerId || customer.id;
}

async function createSubscriptionOrder(request, readJson, send) {
  const body = await readBody(request, readJson, send);
  if (!body) return;

  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in again before starting checkout." });
    return;
  }

  const requestedTestIds = Array.isArray(body.testIds) ? body.testIds.map((id) => String(id).padStart(2, "0").trim()) : [];
  
  // Find which valid pack matches the requested test IDs
  const matchedPack = VALID_MOCK_PACKS.find(
    (pack) =>
      pack.length === requestedTestIds.length &&
      pack.every((id) => requestedTestIds.includes(id))
  ) || VALID_MOCK_PACKS.find(
    (pack) => requestedTestIds.some((id) => pack.includes(id))
  );

  if (!matchedPack) {
    send(400, { error: "Choose a valid SAT mock paper pack to purchase." });
    return;
  }
  const testIds = matchedPack;

  const student = await Registration.findOne({ _id: identity.id, email: identity.email, verified: true })
    .select("name email phone +razorpayCustomerId");
  if (!student) {
    send(404, { error: "A verified SAT student account is required before checkout." });
    return;
  }

  const existingAccess = await getStudentMockAccess(identity.email);
  if (existingAccess.fullAccess) {
    send(409, { error: "Your full SAT mock library is already unlocked." });
    return;
  }
  if (testIds.every((testId) => existingAccess.unlockedTestIds.includes(testId))) {
    send(409, { error: "This mock paper pack is already unlocked on your account." });
    return;
  }

  const config = getPaymentConfig();
  let customerId = student.razorpayCustomerId || null;
  if (!customerId) {
    try {
      customerId = await getOrCreateRazorpayCustomer(student);
    } catch (err) {
      console.warn("Notice: Razorpay customer creation skipped:", err.message);
    }
  }
  const receipt = `sat_${Date.now()}_${randomBytes(5).toString("hex")}`;
  const order = await razorpayRequest("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: config.amount,
      currency: config.currency,
      receipt,
      notes: {
        product: `SAT Mock Pack ${testIds[0]}–${testIds[testIds.length - 1]}`,
        test_ids: testIds.join(","),
        student_email: student.email,
        registration_id: String(student._id),
        base_amount_paise: String(config.baseAmount),
        tax_amount_paise: String(config.taxAmount),
        tax_percent: String(config.taxPercent),
      },
    }),
  });

  await SubscriptionPayment.create({
    studentEmail: student.email,
    studentName: student.name,
    razorpayOrderId: order.id,
    amount: config.amount,
    baseAmount: config.baseAmount,
    taxAmount: config.taxAmount,
    taxPercent: config.taxPercent,
    currency: config.currency,
    durationDays: config.durationDays,
    testIds,
  });

  send(201, {
    keyId: config.keyId,
    order: {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
    },
    student: { name: student.name, email: student.email },
    customerId,
    subscription: { durationDays: config.durationDays, testIds, pricing: pricingDetails(config) },
  });
}

function signatureMatches(orderId, paymentId, submittedSignature, secret) {
  if (typeof submittedSignature !== "string" || !/^[a-f\d]{64}$/i.test(submittedSignature)) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const submitted = Buffer.from(submittedSignature, "hex");
  return submitted.length === expected.length && timingSafeEqual(submitted, expected);
}

async function verifySubscriptionPayment(request, readJson, send) {
  const body = await readBody(request, readJson, send);
  if (!body) return;

  const orderId = typeof body.razorpay_order_id === "string" ? body.razorpay_order_id.trim() : "";
  const paymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id.trim() : "";
  const signature = body.razorpay_signature;
  if (!orderId || !paymentId || !signature) {
    send(400, { error: "Razorpay order, payment, and signature values are required." });
    return;
  }

  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in again before verifying this payment." });
    return;
  }

  const config = getPaymentConfig();
  if (!signatureMatches(orderId, paymentId, signature, config.keySecret)) {
    send(400, { error: "Payment signature could not be verified." });
    return;
  }

  const record = await SubscriptionPayment.findOne({ razorpayOrderId: orderId });
  if (!record) {
    send(404, { error: "This payment order was not created by EduTechEx." });
    return;
  }
  if (record.studentEmail !== identity.email) {
    send(403, { error: "This payment order belongs to a different student account." });
    return;
  }
  if (record.status === "paid") {
    if (record.razorpayPaymentId !== paymentId) {
      send(409, { error: "This order was already verified with a different payment." });
      return;
    }
    send(200, { success: true, status: "paid", expiresAt: record.expiresAt, testIds: record.testIds || [] });
    return;
  }

  let payment = null;
  try {
    payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
  } catch (err) {
    console.warn("Notice: Razorpay GET payment network check skipped (signature verified):", err.message);
  }

  if (payment) {
    if (payment.order_id !== orderId || payment.amount !== record.amount || payment.currency !== record.currency) {
      send(400, { error: "Payment details do not match the order." });
      return;
    }

    // Some Razorpay accounts leave successful payments in `authorized` until
    // capture. Capture only after signature, order, amount, and currency checks.
    if (payment.status === "authorized") {
      try {
        payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, {
          method: "POST",
          body: JSON.stringify({ amount: record.amount, currency: record.currency }),
        });
      } catch {
        try {
          payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
        } catch (_) {}
      }

      if (payment && (payment.order_id !== orderId || payment.amount !== record.amount || payment.currency !== record.currency)) {
        send(400, { error: "Captured payment details do not match the order." });
        return;
      }
    }

    if (payment && payment.status !== "captured" && payment.status !== "authorized") {
      send(409, { error: "Payment is not captured yet. Please wait a moment and try verifying again.", status: payment.status });
      return;
    }
  }

  const paidAt = new Date();
  const expiresAt = await getPurchaseExpiry(record, paidAt);
  const updated = await SubscriptionPayment.findOneAndUpdate(
    { _id: record._id, status: "created" },
    { $set: { status: "paid", razorpayPaymentId: paymentId, paidAt, expiresAt } },
    { returnDocument: "after" }
  );

  if (!updated) {
    const current = await SubscriptionPayment.findById(record._id);
    if (current?.status === "paid" && current.razorpayPaymentId === paymentId) {
      send(200, { success: true, status: "paid", expiresAt: current.expiresAt });
      return;
    }
    send(409, { error: "This order could not be marked as paid. Contact support with your Razorpay payment ID." });
    return;
  }

  send(200, {
    success: true,
    status: "paid",
    studentEmail: updated.studentEmail,
    expiresAt: updated.expiresAt,
    testIds: updated.testIds || [],
  });
}

async function handleSubscriptionWebhook(request, readJson, send) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    send(503, { error: "Razorpay webhook is not configured." });
    return;
  }

  const body = await readBody(request, readJson, send);
  if (!body) return;

  const submitted = request.headers["x-razorpay-signature"];
  const rawBody = request.rawBody;
  if (typeof submitted !== "string" || !/^[a-f\d]{64}$/i.test(submitted) || !Buffer.isBuffer(rawBody)) {
    send(400, { error: "Invalid Razorpay webhook signature." });
    return;
  }
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest();
  const received = Buffer.from(submitted, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    send(400, { error: "Invalid Razorpay webhook signature." });
    return;
  }

  if (body.event !== "payment.captured") {
    send(200, { received: true });
    return;
  }

  const payment = body.payload?.payment?.entity;
  if (!payment?.id || !payment?.order_id || payment.status !== "captured") {
    send(400, { error: "Captured payment details are missing from the webhook." });
    return;
  }

  const existing = await SubscriptionPayment.findOne({ razorpayOrderId: payment.order_id });
  if (!existing) {
    send(200, { received: true });
    return;
  }
  if (existing.status === "paid") {
    send(200, { received: true });
    return;
  }
  if (payment.amount !== existing.amount || payment.currency !== existing.currency) {
    send(400, { error: "Webhook payment details do not match the order." });
    return;
  }

  const paidAt = new Date();
  const expiresAt = await getPurchaseExpiry(existing, paidAt);
  await SubscriptionPayment.findOneAndUpdate(
    { _id: existing._id, status: "created" },
    { $set: { status: "paid", razorpayPaymentId: payment.id, paidAt, expiresAt } }
  );
  send(200, { received: true });
}

async function getStudentSubscription(request, send) {
  const identity = getAuthenticatedStudent(request);
  if (!identity) {
    send(401, { error: "Please sign in to check your SAT subscription." });
    return;
  }

  const access = await getStudentMockAccess(identity.email);
  send(200, {
    success: true,
    active: access.fullAccess,
    fullAccess: access.fullAccess,
    hasPurchase: access.hasPurchase,
    unlockedTestIds: access.unlockedTestIds,
    expiresAt: access.expiresAt,
  });
}

module.exports = {
  getSubscriptionPricing,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  handleSubscriptionWebhook,
  getStudentSubscription,
};

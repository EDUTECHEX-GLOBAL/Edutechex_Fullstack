const SubscriptionPayment = require("../models/paymodel");

async function getActiveSubscription(studentEmail) {
  const email = String(studentEmail || "").trim().toLowerCase();
  if (!email) return null;

  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return SubscriptionPayment.findOne({
    studentEmail: { $regex: new RegExp(`^${escaped}$`, "i") },
    status: "paid",
    $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }],
  })
    .sort({ expiresAt: -1 })
    .lean();
}

async function getStudentMockAccess(studentEmail) {
  const email = String(studentEmail || "").trim().toLowerCase();
  if (!email) return { fullAccess: false, hasPurchase: false, unlockedTestIds: [], expiresAt: null };

  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const purchases = await SubscriptionPayment.find({
    studentEmail: { $regex: new RegExp(`^${escaped}$`, "i") },
    status: "paid",
    $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }],
  }).select("testIds expiresAt fullAccess amount").lean();

  let fullAccess = false;
  const unlocked = new Set();
  for (const purchase of purchases) {
    if (purchase.fullAccess === true) {
      fullAccess = true;
    } else if (Array.isArray(purchase.testIds) && purchase.testIds.length > 0) {
      for (const testId of purchase.testIds) {
        unlocked.add(String(testId).padStart(2, "0"));
      }
    }
  }
  if (unlocked.size >= 100) fullAccess = true;
  if (fullAccess) {
    for (let testNumber = 4; testNumber <= 150; testNumber += 1) {
      unlocked.add(String(testNumber).padStart(2, "0"));
    }
  }

  const expiresAt = purchases.map((purchase) => purchase.expiresAt).filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;

  return {
    fullAccess,
    hasPurchase: purchases.length > 0,
    unlockedTestIds: [...unlocked].sort((a, b) => Number(a) - Number(b)),
    expiresAt,
  };
}

function canAccessMockNumber(access, testNumber) {
  const number = Number(testNumber);
  if (!Number.isInteger(number) || number < 1 || number > 150) return false;
  if (number >= 1 && number <= 3) return true;
  return Boolean(access?.fullAccess || access?.unlockedTestIds?.includes(String(number).padStart(2, "0")));
}

module.exports = { getActiveSubscription, getStudentMockAccess, canAccessMockNumber };

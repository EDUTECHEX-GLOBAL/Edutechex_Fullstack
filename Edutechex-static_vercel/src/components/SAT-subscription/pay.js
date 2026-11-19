import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import edutechLogo from "../../assets/Edutech-logo.svg";
import "./pay.css";

const API_URL = (
  process.env.REACT_APP_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");
const STUDENT_KEY = "edutechex-sat-registration";
const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let razorpayCheckoutPromise = null;

const MOCK_PACK_RANGES = [
  { start: 4, end: 14, label: "Papers 04–14 (10-Paper Pack)" },
  { start: 15, end: 24, label: "Papers 15–24 (10-Paper Pack)" },
  { start: 25, end: 34, label: "Papers 25–34 (10-Paper Pack)" },
  { start: 35, end: 44, label: "Papers 35–44 (10-Paper Pack)" },
  { start: 45, end: 54, label: "Papers 45–54 (10-Paper Pack)" },
  { start: 55, end: 64, label: "Papers 55–64 (10-Paper Pack)" },
  { start: 65, end: 74, label: "Papers 65–74 (10-Paper Pack)" },
  { start: 75, end: 84, label: "Papers 75–84 (10-Paper Pack)" },
  { start: 85, end: 90, label: "Papers 85–90 (Pack)" },
  { start: 91, end: 100, label: "Papers 91–100 (10-Paper Pack)" },
  { start: 101, end: 110, label: "Papers 101–110 (10-Paper Pack)" },
  { start: 111, end: 120, label: "Papers 111–120 (10-Paper Pack)" },
  { start: 121, end: 130, label: "Papers 121–130 (10-Paper Pack)" },
  { start: 131, end: 140, label: "Papers 131–140 (10-Paper Pack)" },
  { start: 141, end: 150, label: "Papers 141–150 (10-Paper Pack)" },
];

const MOCK_PACKS = MOCK_PACK_RANGES.map((r) => {
  const ids = [];
  for (let i = r.start; i <= r.end; i++) ids.push(String(i).padStart(2, "0"));
  return ids;
});

function getNextMockPack(unlockedTestIds = []) {
  const unlocked = new Set(unlockedTestIds);
  return MOCK_PACKS.find((pack) => pack.some((testId) => !unlocked.has(testId))) || MOCK_PACKS[0];
}

function getStudentAuthHeaders() {
  try {
    const session = JSON.parse(sessionStorage.getItem(STUDENT_KEY) || "null");
    return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
  } catch {
    return {};
  }
}

function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve(true);
  }
  if (razorpayCheckoutPromise) {
    return razorpayCheckoutPromise;
  }

  razorpayCheckoutPromise = new Promise((resolve) => {
    let script = document.querySelector(`script[src="${CHECKOUT_SCRIPT}"]`);

    if (!script) {
      script = document.createElement("script");
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
    }

    let settled = false;
    const timeout = window.setTimeout(() => finish(!!window.Razorpay), 15000);
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (!ready) {
        script.remove();
        razorpayCheckoutPromise = null;
      }
      resolve(ready);
    };

    script.addEventListener("load", () => finish(!!window.Razorpay), { once: true });
    script.addEventListener("error", () => finish(false), { once: true });

    if (!script.isConnected) {
      document.body.appendChild(script);
    }
  });

  return razorpayCheckoutPromise;
}

function formatAmount(amountInMinorUnits, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amountInMinorUnits) / 100);
}

// 3D SAT Paper with Graduation Cap Illustration (matching Image 1)
function SatGraduationIllustration() {
  return (
    <div className="sat-sub-illustration-wrap" aria-hidden="true">
      <svg
        className="sat-sub-illustration-svg"
        viewBox="0 0 320 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soft radial background glow */}
        <ellipse cx="160" cy="125" rx="130" ry="85" fill="#e8f2fe" opacity="0.8" />
        <circle cx="160" cy="115" r="75" fill="#dbeafe" opacity="0.6" />

        {/* Decorative sparkles */}
        <path
          d="M62 48C62 53 58 57 53 57C58 57 62 61 62 66C62 61 66 57 71 57C66 57 62 53 62 48Z"
          fill="#3b82f6"
        />
        <path
          d="M268 70C268 74 265 77 261 77C265 77 268 80 268 84C268 80 271 77 275 77C271 77 268 74 268 70Z"
          fill="#60a5fa"
        />
        <circle cx="68" cy="85" r="2.5" fill="#93c5fd" />
        <circle cx="255" cy="45" r="2.5" fill="#93c5fd" />

        {/* Angled SAT Paper */}
        <g transform="rotate(-6 160 120)">
          {/* Paper Shadow */}
          <rect
            x="96"
            y="54"
            width="128"
            height="140"
            rx="14"
            fill="#1e3a8a"
            opacity="0.08"
          />
          {/* Paper Body */}
          <rect
            x="94"
            y="50"
            width="128"
            height="140"
            rx="14"
            fill="#ffffff"
            stroke="#93c5fd"
            strokeWidth="3"
          />

          {/* Heading 'SAT' */}
          <text
            x="158"
            y="96"
            textAnchor="middle"
            fill="#1e3a8a"
            fontSize="26"
            fontWeight="900"
            fontFamily="Inter, system-ui, sans-serif"
            letterSpacing="1"
          >
            SAT
          </text>

          {/* Divider line */}
          <rect x="114" y="108" width="88" height="4" rx="2" fill="#bfdbfe" />

          {/* Question Row 1 */}
          <rect x="114" y="124" width="14" height="14" rx="4" fill="#3b82f6" />
          <path
            d="M117 131L120 134L125 128"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="134" y="128" width="68" height="6" rx="3" fill="#e2e8f0" />

          {/* Question Row 2 */}
          <rect x="114" y="148" width="14" height="14" rx="4" fill="#3b82f6" />
          <path
            d="M117 155L120 158L125 152"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="134" y="152" width="50" height="6" rx="3" fill="#e2e8f0" />
        </g>

        {/* Graduation Mortarboard Hat sitting on top */}
        <g transform="translate(145, 10) scale(0.95)">
          {/* Cap Skull Underneath */}
          <path
            d="M50 48C50 48 50 68 85 68C120 68 120 48 120 48L110 43C110 43 108 58 85 58C62 58 60 43 60 43L50 48Z"
            fill="#0f172a"
          />
          <path
            d="M58 48C58 56 70 62 85 62C100 62 112 56 112 48"
            stroke="#1e293b"
            strokeWidth="2"
          />

          {/* Cap Top Rhombus */}
          <polygon
            points="85,18 142,38 85,58 28,38"
            fill="#1e293b"
            stroke="#0f172a"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <polygon
            points="85,20 138,38 85,55 32,38"
            fill="#0f2550"
          />

          {/* Center Button */}
          <circle cx="85" cy="38" r="4.5" fill="#f59e0b" />

          {/* Golden Tassel */}
          <path
            d="M85 38C98 38 124 46 128 65C130 73 129 82 129 88"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="126" y="86" width="6" height="15" rx="2" fill="#d97706" />
          <rect x="127" y="87" width="4" height="13" rx="1.5" fill="#f59e0b" />
        </g>
      </svg>
    </div>
  );
}

// Dot Pattern Component
function DotGridPattern({ className }) {
  return (
    <div className={`sat-sub-dots ${className}`} aria-hidden="true">
      {Array.from({ length: 25 }).map((_, i) => (
        <span key={i} className="sat-sub-dot" />
      ))}
    </div>
  );
}

export default function SatSubscription({ isModal = false, onClose = null, onSubscribed = null, selectedTestIds = null, unlockedTestIds: initialUnlockedTestIds = [] }) {
  const [student, setStudent] = useState(null);
  const [pricing, setPricing] = useState({
    baseAmount: 99900,
    taxPercent: 0,
    taxAmount: 0,
    totalAmount: 99900,
    currency: "INR",
    isTestMode: false,
  });
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [paid, setPaid] = useState(false);
  const [unlockedTestIds, setUnlockedTestIds] = useState(initialUnlockedTestIds);
  const [selectedPackTestIds, setSelectedPackTestIds] = useState(
    selectedTestIds?.length ? selectedTestIds : MOCK_PACKS[0]
  );
  const [expiresAt, setExpiresAt] = useState("");
  const allPacksUnlocked = MOCK_PACKS.every((pack) => pack.every((testId) => unlockedTestIds.includes(testId)));

  useEffect(() => {
    if (selectedTestIds?.length) setSelectedPackTestIds(selectedTestIds);
  }, [selectedTestIds?.join(",")]);

  useEffect(() => {
    let savedStudent = null;
    try {
      savedStudent = JSON.parse(sessionStorage.getItem(STUDENT_KEY) || "null");
      if (savedStudent?.email) setStudent(savedStudent);
    } catch {
      setStudent(null);
    }

    let active = true;
    fetch(`${API_URL}/pay/pricing`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (active && response.ok && data.pricing) setPricing(data.pricing);
      })
      .catch(() => {});

    if (savedStudent?.email) {
      fetch(`${API_URL}/pay/subscription`, { headers: getStudentAuthHeaders() })
        .then((response) => response.json().then((data) => ({ response, data })))
        .then(({ response, data }) => {
          if (!active || !response.ok) return;
          const isActive = Boolean(data.fullAccess ?? data.active);
          const purchasedTestIds = Array.isArray(data.unlockedTestIds) ? data.unlockedTestIds : [];
          setPaid(isActive);
          setUnlockedTestIds(purchasedTestIds);
          setExpiresAt(data.expiresAt || "");
          const subObj = { active: isActive, unlockedTestIds: purchasedTestIds, expiresAt: data.expiresAt || null };
          sessionStorage.setItem("edutechex-sat-subscription-active", JSON.stringify(subObj));
          localStorage.setItem("edutechex-sat-subscription-active", JSON.stringify(subObj));
          if (isActive) setMessage("Your full-library SAT access is active.");
          else if (!selectedTestIds?.length) setSelectedPackTestIds(getNextMockPack(purchasedTestIds));
        })
        .catch(() => {});
    }

    loadRazorpayCheckout().then((ready) => {
      if (!active) return;
      setCheckoutReady(ready);
      setLoadFailed(!ready);
    });

    return () => {
      active = false;
    };
  }, []);

  const startCheckout = async () => {
    if (!student?.email || !student?.token) {
      setMessage("Please sign in or register for SAT practice before subscribing.");
      return;
    }
    if (!checkoutReady || !window.Razorpay || processing) return;

    setProcessing(true);
    setMessage("");
    try {
      const orderResponse = await fetch(`${API_URL}/pay/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getStudentAuthHeaders() },
        body: JSON.stringify({ testIds: selectedPackTestIds }),
      });
      const orderData = await orderResponse.json().catch(() => ({}));
      if (!orderResponse.ok) throw new Error(orderData.error || "Unable to start checkout. Please try again.");
      if (orderData.subscription?.pricing) {
        setPricing(orderData.subscription.pricing);
      } else if (orderData.keyId?.startsWith("rzp_test_")) {
        setPricing((prev) => ({ ...prev, isTestMode: true }));
      }

      let verificationStarted = false;
      const checkout = new window.Razorpay({
        key: orderData.keyId,
        order_id: orderData.order.id,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "EduTechEx",
        description: `SAT Mock Pack ${selectedPackTestIds[0]}-${selectedPackTestIds[selectedPackTestIds.length - 1]} (${orderData.subscription.durationDays || 365} days)`,
        customer_id: orderData.customerId,
        prefill: {
          name: orderData.student?.name || student?.name || "",
          email: orderData.student?.email || student?.email || "",
          contact: student?.phone || "",
        },
        theme: { color: "#2563eb" },
        handler: async (paymentResponse) => {
          verificationStarted = true;
          try {
            const verifyResponse = await fetch(`${API_URL}/pay/verify-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getStudentAuthHeaders() },
              body: JSON.stringify(paymentResponse),
            });
            const verifyData = await verifyResponse.json().catch(() => ({}));
            if (!verifyResponse.ok || !verifyData.success) {
              throw new Error(verifyData.error || "Payment verification failed. Please contact support before trying again.");
            }
            const purchasedIds = verifyData.testIds || orderData.subscription?.testIds || selectedPackTestIds;
            const nextUnlockedTestIds = [...new Set([...unlockedTestIds, ...purchasedIds])].sort((a, b) => Number(a) - Number(b));
            const allPapersUnlocked = nextUnlockedTestIds.length >= 100;
            setPaid(allPapersUnlocked);
            setUnlockedTestIds(nextUnlockedTestIds);
            setSelectedPackTestIds(getNextMockPack(nextUnlockedTestIds));
            const exp = verifyData.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
            setExpiresAt(exp);
            const subObj = { active: allPapersUnlocked, unlockedTestIds: nextUnlockedTestIds, expiresAt: exp };
            sessionStorage.setItem("edutechex-sat-subscription-active", JSON.stringify(subObj));
            localStorage.setItem("edutechex-sat-subscription-active", JSON.stringify(subObj));
            setMessage(allPapersUnlocked
              ? "Payment verified. All SAT mock papers are now unlocked."
              : `Payment verified. Mock papers ${purchasedIds[0]}–${purchasedIds[purchasedIds.length - 1]} are unlocked.`);
            if (onSubscribed) {
              onSubscribed(subObj);
            }
          } catch (error) {
            setMessage(error.message || "Payment was received, but verification could not be completed. Please contact support.");
          } finally {
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            if (!verificationStarted) setProcessing(false);
          },
        },
      });

      checkout.on("payment.failed", (event) => {
        setProcessing(false);
        setMessage(event?.error?.description || "Payment was not completed. You can try again.");
      });
      checkout.open();
    } catch (error) {
      setMessage(error.message || "Unable to start checkout. Please try again.");
      setProcessing(false);
    }
  };

  const cardContent = (
    <div className={`sat-sub-card-container ${isModal ? "is-modal-container" : ""}`}>
      <section className="sat-sub-card" aria-labelledby="sat-sub-title">
        {/* Modal Close Button */}
        {isModal && onClose && (
          <button
            type="button"
            className="sat-sub-modal-close-btn"
            onClick={onClose}
            aria-label="Close subscription modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* ==================== LEFT COLUMN ==================== */}
        <div className="sat-sub-col is-left">
          {/* Back Button matching Image 1 */}
          <div className="sat-sub-back-wrap">
            {isModal && onClose ? (
              <button type="button" className="sat-sub-back-btn" onClick={onClose}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span>Back to mock tests</span>
              </button>
            ) : (
              <Link className="sat-sub-back-btn" to="/sat/mock-tests">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span>Back to mock tests</span>
              </Link>
            )}
          </div>

            {/* SAT Test Paper & Mortarboard Cap Illustration */}
            <SatGraduationIllustration />

            {/* Heading matching Image 1 */}
            <h1 className="sat-sub-main-title" id="sat-sub-title">
              <span className="sat-sub-title-dark">Unlock your</span>
              <span className="sat-sub-title-blue">SAT practice library</span>
            </h1>

            {/* Subtitle explaining free vs premium */}
            <p className="sat-sub-description">
              Get your first 3 papers free. Each ₹999 pack unlocks 10 full-length SAT mock papers for one year.</p>

            {/* 3 Key Benefits with rounded icons */}
            <ul className="sat-sub-benefits-list">
              <li className="sat-sub-benefit-item">
                <div className="sat-sub-benefit-icon is-check">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="sat-sub-benefit-text">Unlock the 10 papers in your selected pack (Papers 04–14)</span>
              </li>

              <li className="sat-sub-benefit-item">
                <div className="sat-sub-benefit-icon is-book">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </div>
                <span className="sat-sub-benefit-text">Timed Reading and Writing, and Math modules</span>
              </li>

              <li className="sat-sub-benefit-item">
                <div className="sat-sub-benefit-icon is-chart">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <rect x="2" y="10" width="3.5" height="8" rx="1" />
                    <rect x="8.2" y="5" width="3.5" height="13" rx="1" />
                    <rect x="14.5" y="1" width="3.5" height="17" rx="1" />
                  </svg>
                </div>
                <span className="sat-sub-benefit-text">Score reports after each attempt</span>
              </li>
            </ul>
          </div>

          {/* ==================== RIGHT COLUMN ==================== */}
          <div className="sat-sub-col is-right">
            {/* Pill Eyebrow Badge matching Image 1 */}
            <div className="sat-sub-eyebrow-badge">
              <svg className="sat-sub-eyebrow-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 2 9 12 22 22 9 12 2" />
              </svg>
              <span>EDUTECHEX SAT PRACTICE</span>
            </div>

            {/* Right Column Title */}
            <h2 className="sat-sub-journey-title">
              Choose a 10-paper pack<br />your SAT journey
            </h2>

            {/* Right Column Subtitle */}
            <p className="sat-sub-journey-sub">
              Each ₹999 purchase unlocks 10 SAT mock papers for one year.
            </p>

            {!paid && !allPacksUnlocked && (
              <label style={{ display: "grid", gap: 7, margin: "16px 0", color: "#334155", fontWeight: 650 }}>
                Choose a 10-paper pack
                <select
                  value={selectedPackTestIds.join(",")}
                  onChange={(event) => setSelectedPackTestIds(event.target.value.split(","))}
                  style={{ width: "100%", minHeight: 42, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#1e293b" }}
                >
                  {MOCK_PACK_RANGES.map((range, index) => {
                    const pack = MOCK_PACKS[index];
                    const owned = pack.every((testId) => unlockedTestIds.includes(testId));
                    return (
                      <option key={pack[0]} value={pack.join(",")} disabled={owned}>
                        {range.label}{owned ? " (already unlocked)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

            {/* Pricing Summary Box matching Image 1 */}
            <div className="sat-sub-pricing-box">
              {/* Row 1: Subscription */}
              <div className="sat-sub-pricing-row">
                <div className="sat-sub-row-label">
                  <div className="sat-sub-row-icon is-crown">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </div>
                  <span>10-paper pack</span>
                </div>
                <span className="sat-sub-row-price">
                  {formatAmount(pricing.baseAmount, pricing.currency)}
                </span>
              </div>

              {/* Row 2: Tax */}
              <div className="sat-sub-pricing-row">
                <div className="sat-sub-row-label">
                  <div className="sat-sub-row-icon is-tag">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" stroke="#ffffff" strokeWidth="2" />
                    </svg>
                  </div>
                  <span>{pricing.taxPercent > 0 ? `Tax (${pricing.taxPercent}%)` : "Tax (All-Inclusive)"}</span>
                </div>
                <span className="sat-sub-row-price">
                  {pricing.taxAmount > 0 ? formatAmount(pricing.taxAmount, pricing.currency) : "₹0.00"}
                </span>
              </div>

              {/* Row 3: Total Due (Highlighted blue banner) */}
              <div className="sat-sub-total-due-row">
                <span className="sat-sub-total-label">Total due</span>
                <span className="sat-sub-total-amount">
                  {formatAmount(pricing.totalAmount, pricing.currency)}
                </span>
              </div>
            </div>

            {/* Action State: Subscribed OR Checkout CTA */}
            {paid || allPacksUnlocked ? (
              <div className="sat-sub-active-card" role="status">
                <div className="sat-sub-active-header">
                  <span className="sat-sub-active-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Premium Active</span>
                  </span>
                </div>
                <strong className="sat-sub-active-title">Your SAT subscription is active!</strong>
                <p className="sat-sub-active-desc">
                  All full-length practice papers, analytics, and official scorecards are unlocked
                  {expiresAt && <> through <strong>{new Date(expiresAt).toLocaleDateString()}</strong></>}.
                </p>
                <div className="sat-sub-active-btn-group">
                  {isModal && onClose ? (
                    <button
                      type="button"
                      className="sat-sub-cta-btn is-active-nav"
                      onClick={onClose}
                    >
                      <span>Start Mock Tests Now</span>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  ) : (
                    <>
                      <Link to="/sat/dashboard" className="sat-sub-cta-btn is-active-nav">
                        <span>Go to SAT Dashboard</span>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </Link>
                      <Link to="/sat/mock-tests" className="sat-sub-cta-btn is-active-secondary">
                        <span>Explore All Practice Mocks</span>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                <button
                  className="sat-sub-cta-btn"
                  type="button"
                  onClick={startCheckout}
                  disabled={!checkoutReady || processing}
                  id="sat-subscribe-razorpay-btn"
                >
                  <svg className="sat-sub-btn-lock" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>
                    {processing
                      ? "Processing…"
                      : checkoutReady
                        ? "Buy this 10-paper pack for ₹999"
                        : loadFailed
                          ? "Checkout unavailable"
                          : "Loading secure checkout…"}
                  </span>
                  {!processing && checkoutReady && (
                    <svg className="sat-sub-btn-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  )}
                </button>

                {!student?.email && (
                  <p className="sat-sub-login-prompt">
                    Already registered? <Link to="/sat/login">Sign in</Link> or <Link to="/sat/register">create an account</Link>.
                  </p>
                )}

                {/* Helpful Test Mode Hint (visible when Razorpay is in test mode) */}
                {pricing.isTestMode && (
                  <div className="sat-sub-test-box">
                    <div className="sat-sub-test-header">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <span>Razorpay Test Mode Active</span>
                    </div>
                    <div>
                      In the checkout popup, click <strong>Cards</strong> and enter test card <code>4111 1111 1111 1111</code> (any future expiry e.g. <code>12/28</code>, CVV <code>123</code>), then click <strong>Success</strong>. (Real UPI apps like GPay/PhonePe cannot scan test QR codes).
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Error or Alert Message */}
            {message && !paid && (
              <div className="sat-sub-alert-msg" role="alert">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{message}</span>
              </div>
            )}

            {loadFailed && (
              <p className="sat-sub-note-text is-warn">
                Secure checkout could not be loaded. Please check your connection and refresh the page.
              </p>
            )}

            {/* Security Assurance footer matching Image 1 */}
            <div className="sat-sub-security-footer">
              <span className="sat-sub-sec-divider-text">or</span>
              <div className="sat-sub-security-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Your payment is secure and encrypted</span>
              </div>
            </div>
          </div>
        </section>
      </div>
  );

  if (isModal) {
    return (
      <div className="sat-sub-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
        <div className="sat-sub-modal-dialog" onClick={(e) => e.stopPropagation()}>
          {cardContent}
        </div>
      </div>
    );
  }

  return (
    <main className="sat-sub-page">
      {/* Decorative Dot Grids */}
      <DotGridPattern className="is-top-left" />
      <DotGridPattern className="is-bottom-right" />

      {/* Decorative Watermark Graduation Cap in background */}
      <div className="sat-sub-bg-watermark" aria-hidden="true">
        <svg viewBox="0 0 200 150" fill="currentColor">
          <polygon points="100,20 180,55 100,90 20,55" />
          <path d="M50 70v35c0 15 22 25 50 25s50-10 50-25V70" />
          <path d="M180 55v45" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>

      {/* Brand Top Navigation Bar */}
      <header className="sat-sub-header">
        <div className="sat-sub-header-container">
          <Link to="/" className="sat-sub-header-brand" aria-label="EduTechEX Home">
            <img src={edutechLogo} alt="EduTechEX" className="sat-sub-header-logo" />
          </Link>
          <Link to="/sat/dashboard" className="sat-sub-header-dash-link">
            <span>Dashboard</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </header>

      {cardContent}
    </main>
  );
}

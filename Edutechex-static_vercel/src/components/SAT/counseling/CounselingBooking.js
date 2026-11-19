import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import edutechLogo from "../../../assets/edutech-logo.png";
import satBannerIllustration from "../../../assets/sat-banner-illustration.png";
import "./counseling.css";

const API_URL = (process.env.REACT_APP_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
const STORAGE_KEY = "edutechex-sat-registration";
const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let rzpScriptPromise = null;

// ───────── Utilities ─────────
function getStoredStudent() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "null");
  } catch { return null; }
}

function satAuthHeaders() {
  const s = getStoredStudent();
  return s?.token ? { Authorization: `Bearer ${s.token}` } : {};
}

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  if (rzpScriptPromise) return rzpScriptPromise;
  rzpScriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    const timeout = setTimeout(() => resolve(!!window.Razorpay), 15000);
    script.onload = () => { clearTimeout(timeout); resolve(!!window.Razorpay); };
    script.onerror = () => { clearTimeout(timeout); rzpScriptPromise = null; resolve(false); };
    document.body.appendChild(script);
  });
  return rzpScriptPromise;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00+05:30");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

function formatHeadingDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00+05:30");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).toUpperCase();
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getNext14Days() {
  const days = [];
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const today = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));

  // Include today; the API filters out slots that have already started.
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
  }
  return days;
}

const groupOf = (t) => {
  const h = Number(String(t).split(":")[0]);
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
};

// ───────── UI Components ─────────

function StepIndicator({ step, maxUnlockedStep = step, onStepClick }) {
  const steps = ["Mock Test", "Counselor", "Date & Time", "Confirm"];
  return (
    <div className="csl-steps-wrap">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < step;
        const isCurrent = stepNum === step;
        const isClickable = stepNum <= maxUnlockedStep && stepNum !== step;

        return (
          <div
            key={label}
            className={`csl-step ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""} ${isClickable ? "is-clickable" : ""}`}
            onClick={() => {
              if (isClickable && onStepClick) onStepClick(stepNum);
            }}
            title={isClickable ? `Go to Step ${stepNum}: ${label}` : undefined}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
          >
            <div className="csl-step-num">{isDone ? "✓" : stepNum}</div>
            <span className="csl-step-label">{label}</span>
            {i < steps.length - 1 && <div className="csl-step-line" />}
          </div>
        );
      })}
    </div>
  );
}

function EligibilityCard({ result, isSelected, onBook }) {
  const isFree = result.pricing?.bookingType === "free";
  const rw = (result.modules?.[0]?.score || 0) + (result.modules?.[1]?.score || 0);
  const math = (result.modules?.[2]?.score || 0) + (result.modules?.[3]?.score || 0);
  const isBooked = result.alreadyBooked;

  return (
    <article className={`csl-eligibility-card ${isSelected && !isBooked ? "is-selected" : ""} ${isBooked ? "is-booked-card" : ""}`}>
      {/* Corner checkmark badge when active/selected */}
      {isSelected && !isBooked && (
        <div className="csl-card-selected-corner-badge" title="Selected for booking">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}

      <div className="csl-eligibility-top">
        <div className="csl-elig-mock-pill">MOCK {String(result.mockTestNumber || result.mockTestId).padStart(2, "0")}</div>
        <div className={`csl-elig-price-pill ${isFree ? "is-free" : "is-paid"}`}>
          {isFree ? "✓ Free Session" : "INR 999 Session"}
        </div>
      </div>

      <h3 className="csl-elig-title">{result.mockTestTitle}</h3>

      <div className="csl-elig-scores">
        <div className="csl-elig-score-box">
          <span className="csl-elig-score-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            SCALE SCORE
          </span>
          <strong className="csl-elig-score-val">{result.mockTestScore || 400} / 1600</strong>
        </div>
        <div className="csl-elig-score-box">
          <span className="csl-elig-score-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            READING & WRITING
          </span>
          <strong className="csl-elig-score-val">{rw} / 54</strong>
        </div>
        <div className="csl-elig-score-box">
          <span className="csl-elig-score-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="16" y1="14" x2="16" y2="18" />
              <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" />
            </svg>
            MATH
          </span>
          <strong className="csl-elig-score-val">{math} / 44</strong>
        </div>
      </div>

      {isBooked ? (
        <div className="csl-already-booked-notice">
          <div className="csl-booked-check-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span>Counseling session already booked for this mock test.</span>
        </div>
      ) : (
        <button type="button" className="csl-book-btn" onClick={() => onBook(result)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>
            {isFree
              ? "Book Your Free 30-Minute Counseling Session →"
              : "Book Your Counseling Session – INR 999 →"}
          </span>
        </button>
      )}
    </article>
  );
}

// ───────── Main Component ─────────
export default function CounselingBooking() {
  const dateCarouselRef = useRef(null);

  const scrollDates = (direction) => {
    if (dateCarouselRef.current) {
      const scrollAmount = direction === "left" ? -260 : 260;
      dateCarouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const [searchParams] = useSearchParams();
  const preselectedMockId = searchParams.get("mockTestId");

  // Global state
  const [student] = useState(() => getStoredStudent());
  const [step, setStep] = useState(1); // 1=mock select, 2=counselor, 3=date/time, 4=confirm, 5=success

  // Step 1: Eligibility
  const [eligibleMocks, setEligibleMocks] = useState([]);
  const [loadingMocks, setLoadingMocks] = useState(true);
  const [selectedMock, setSelectedMock] = useState(null);

  // Step 2: Counselor
  const [counselors, setCounselors] = useState([]);
  const [loadingCounselors, setLoadingCounselors] = useState(false);
  const [counselorLoadError, setCounselorLoadError] = useState("");
  const [selectedCounselor, setSelectedCounselor] = useState(null);

  // Step 3: Date & Time
  const dateOptions = getNext14Days();
  const [selectedDate, setSelectedDate] = useState(() => dateOptions[0] || "");
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotLoadError, setSlotLoadError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Step 4: Confirm / payment
  const [booking, setBooking] = useState(null);
  const [rzpReady, setRzpReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Load all completed mocks and their counseling eligibility
  useEffect(() => {
    if (!student?.email || !student?.token) return;
    setLoadingMocks(true);
    fetch(`${API_URL}/sat/mocks/student/${encodeURIComponent(student.email)}`, { headers: satAuthHeaders() })
      .then(r => r.json())
      .then(async data => {
        if (!data.success || !Array.isArray(data.results)) return;
        const seen = new Set();
        const unique = [];
        for (const r of data.results) {
          const tid = String(r.testId).padStart(2, "0");
          if (!seen.has(tid)) { seen.add(tid); unique.push({ ...r, testId: tid }); }
        }

        const eligList = await Promise.all(unique.map(async (mockRes) => {
          try {
            const r = await fetch(`${API_URL}/counseling/eligibility?mockTestId=${mockRes.testId}`, { headers: satAuthHeaders() });
            const d = await r.json();
            if (r.ok && d.eligible) return d;
          } catch { /* skip */ }
          return null;
        }));
        const validList = eligList.filter(Boolean);
        setEligibleMocks(validList);

        // Pre-select mock if specified in query or default to first bookable mock
        if (preselectedMockId) {
          const pid = String(preselectedMockId).padStart(2, "0");
          const found = validList.find(e => e && e.mockTestId === pid);
          if (found) {
            setSelectedMock(found);
            if (!found.alreadyBooked) setStep(2);
          }
        } else {
          const firstBookable = validList.find(e => !e.alreadyBooked);
          if (firstBookable) setSelectedMock(firstBookable);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMocks(false));
  }, [student, preselectedMockId]);

  // Load Razorpay script eagerly
  useEffect(() => { loadRazorpay().then(ok => setRzpReady(ok)); }, []);

  // Load counselors on step 2
  useEffect(() => {
    if (step !== 2) return;
    setLoadingCounselors(true);
    setCounselorLoadError("");
    fetch(`${API_URL}/counselors`, { headers: satAuthHeaders() })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Could not load counselors.");
        const list = Array.isArray(data.counselors) ? data.counselors : [];
        setCounselors(list);
        setSelectedCounselor((previous) => list.find((c) => c._id === previous?._id || c.email === previous?.email) || list[0] || null);
      })
      .catch((error) => {
        setCounselors([]);
        setSelectedCounselor(null);
        setCounselorLoadError(error.message || "Could not load counselors. Please refresh and try again.");
      })
      .finally(() => setLoadingCounselors(false));
  }, [step]);

  // Load slots when counselor or date changes
  const fetchSlots = useCallback(() => {
    if (!selectedCounselor?._id || !selectedDate) return;
    setLoadingSlots(true);
    setSlotLoadError("");
    setSlots([]);
    setSelectedSlot(null);
    fetch(`${API_URL}/counselors/${selectedCounselor._id}/available-slots?date=${selectedDate}`, { headers: satAuthHeaders() })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Could not load available slots.");
        const available = Array.isArray(data.slots) ? data.slots : [];
        setSlots(available);
        setSelectedSlot(available.find((slot) => !slot.isBooked) || null);
        if (!available.length) setSlotLoadError(data.message || "No available slots on this date. Please try another date.");
      })
      .catch((error) => {
        setSlots([]);
        setSelectedSlot(null);
        setSlotLoadError(error.message || "Could not load available slots. Please try again.");
      })
      .finally(() => setLoadingSlots(false));
  }, [selectedCounselor, selectedDate]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // Handle confirm (free) or Razorpay (paid)
  const handleConfirm = async () => {
    if (!selectedMock || !selectedCounselor || !selectedDate || !selectedSlot) return;
    setProcessing(true);
    setMessage("");
    setIsError(false);

    try {
      const res = await fetch(`${API_URL}/counseling/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...satAuthHeaders() },
        body: JSON.stringify({
          mockTestId: selectedMock.mockTestId,
          counselorId: selectedCounselor._id,
          bookingDate: selectedDate,
          startTime: selectedSlot.startTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed.");

      if (data.bookingType === "free") {
        setBooking(data.booking);
        setConfirmed(true);
        setStep(5);
      } else {
        const { razorpayOrder, student: sInfo } = data;
        const pendingBooking = data.booking;

        if (!rzpReady || !window.Razorpay) {
          throw new Error("Secure checkout could not be loaded. Please refresh and try again.");
        }

        let verificationStarted = false;
        const rzp = new window.Razorpay({
          key: razorpayOrder.keyId,
          order_id: razorpayOrder.orderId,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          name: "EduTechEx",
          description: `SAT Counseling Session – ${selectedMock.mockTestTitle}`,
          prefill: { name: sInfo?.name || student?.name || "", email: sInfo?.email || student?.email || "", contact: student?.phone || "" },
          theme: { color: "#2563eb" },
          handler: async (paymentResponse) => {
            verificationStarted = true;
            try {
              const vRes = await fetch(`${API_URL}/counseling/verify-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...satAuthHeaders() },
                body: JSON.stringify({
                  bookingId: pendingBooking._id,
                  ...paymentResponse,
                }),
              });
              const vData = await vRes.json();
              if (!vRes.ok || !vData.success) throw new Error(vData.error || "Payment verification failed.");
              setBooking(vData.booking);
              setConfirmed(true);
              setStep(5);
            } catch (err) {
              setIsError(true);
              setMessage(err.message || "Payment verified but confirmation failed. Contact support.");
            } finally {
              setProcessing(false);
            }
          },
          modal: { ondismiss: () => { if (!verificationStarted) setProcessing(false); } },
        });
        rzp.on("payment.failed", (evt) => {
          setProcessing(false);
          setIsError(true);
          setMessage(evt?.error?.description || "Payment was not completed. Try again.");
        });
        rzp.open();
        return;
      }
    } catch (err) {
      setIsError(true);
      setMessage(err.message || "An error occurred. Please try again.");
    }
    setProcessing(false);
  };

  if (!student?.token) {
    return (
      <div className="csl-page">
        <div className="csl-not-signed-in">
          <h2>Please sign in to book counseling</h2>
          <Link to="/sat/login" className="csl-book-btn" style={{ display: "inline-flex", width: "auto" }}>Go to Login</Link>
        </div>
      </div>
    );
  }

  const studentDisplayName = student?.name || "Aravind Bonda";
  const studentInitial = (studentDisplayName?.[0] || "A").toUpperCase();
  const isFree = selectedMock?.pricing?.bookingType === "free";
  const groupedSlots = slots.reduce((acc, s) => {
    (acc[groupOf(s.startTime)] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="csl-page">
      {/* Top Navbar */}
      <header className="csl-navbar">
        <div className="csl-navbar-inner">
          <Link to="/sat/dashboard" className="csl-navbar-logo-link">
            <img src={edutechLogo} alt="EduTechEX Logo" className="csl-navbar-logo" />
            <span className="csl-navbar-divider">|</span>
          </Link>

          <div className="csl-navbar-user">
            <div className="csl-navbar-user-avatar">{studentInitial}</div>
            <span className="csl-navbar-user-name">{studentDisplayName}</span>
            <svg className="csl-navbar-user-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="csl-container">
        {/* Header Hero Section */}
        <div className="csl-header-hero">
          <div className="csl-header-text">
            <Link to="/sat/dashboard?tab=counseling" className="csl-back-link">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              <span>Back to Dashboard</span>
            </Link>
            <h1 className="csl-page-title">Book a Counseling Session</h1>
            <p className="csl-page-subtitle">
              Get personalized 30-minute SAT guidance from our expert counselors after completing your mock tests.
            </p>

            {/* Step Indicator under Subtitle */}
            {step <= 4 && (
              <StepIndicator
                step={step}
                maxUnlockedStep={Math.max(
                  step,
                  selectedSlot && selectedDate ? 4 : selectedCounselor ? 3 : selectedMock ? 2 : 1
                )}
                onStepClick={(targetStep) => setStep(targetStep)}
              />
            )}
          </div>

          {/* Hero Illustration with Counselor & Student */}
          <div className="csl-hero-art" aria-hidden="true">
            <div className="csl-hero-art-backdrop" />
            <img
              src={satBannerIllustration}
              alt="SAT Counseling Guidance"
              className="csl-hero-art-img"
            />
          </div>
        </div>

        {/* ── STEP 1: SELECT MOCK TEST ── */}
        {step === 1 && (
          <div className="csl-step-panel">
            <div className="csl-panel-header">
              <div className="csl-panel-badge csl-badge-doc">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#3b82f6" />
                  <path d="M14 2v6h6" fill="#93c5fd" />
                  <path d="M8 12h8M8 16h5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="17.5" cy="18.5" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                  <path d="M16 18.5l1 1 2-2" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="csl-panel-header-text">
                <h2 className="csl-panel-title">Select a Completed Mock Test</h2>
                <p className="csl-panel-sub">Each completed mock test entitles you to one counseling session.</p>
              </div>
            </div>

            {loadingMocks ? (
              <div className="csl-loading">Loading your mock tests...</div>
            ) : eligibleMocks.length === 0 ? (
              <div className="csl-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
                <h3>No completed mock tests yet</h3>
                <p>Complete at least one mock test to become eligible for counseling.</p>
                <Link to="/sat/mock-tests" className="csl-book-btn" style={{ display: "inline-flex", marginTop: "12px", width: "auto" }}>
                  Browse Mock Papers
                </Link>
              </div>
            ) : (
              <div className="csl-eligibility-grid">
                {eligibleMocks.map((result) => {
                  const isSelected = selectedMock?.mockTestId === result.mockTestId;
                  return (
                    <EligibilityCard
                      key={result.mockTestId}
                      result={result}
                      isSelected={isSelected}
                      onBook={(r) => {
                        setSelectedMock(r);
                        setStep(2);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: SELECT COUNSELOR ── */}
        {step === 2 && (
          <div className="csl-step-panel">
            <div className="csl-panel-header">
              <div className="csl-panel-badge csl-badge-blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="csl-panel-header-text">
                <h2 className="csl-panel-title">Choose Your Counselor</h2>
                <p className="csl-panel-sub">
                  Booking for: <strong>{selectedMock?.mockTestTitle || "Full SAT Mock 01"}</strong>
                  {" • "}
                  <span className="csl-pill-green">
                    {selectedMock?.pricing?.bookingType === "paid" ? "INR 999 Session" : "Free Session"}
                  </span>
                </p>
              </div>
            </div>

            {loadingCounselors && counselors.length === 0 ? (
              <div className="csl-loading">Loading counselors...</div>
            ) : counselors.length === 0 ? (
              <div className="csl-empty">
                <h3>No counselors available right now</h3>
                <p>{counselorLoadError || "Please check back soon or contact support."}</p>
              </div>
            ) : (
              <div className="csl-counselor-grid">
                {counselors.map((c) => {
                  const isSelected = selectedCounselor?._id === c._id || selectedCounselor?.email === c.email;
                  return (
                    <button
                      type="button"
                      key={c._id || c.email}
                      className={`csl-counselor-card ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setSelectedCounselor(c)}
                    >
                      <div className="csl-counselor-avatar">
                        {c.avatarInitials || (c.name ? c.name.slice(0, 2).toUpperCase() : "AC")}
                      </div>
                      <div className="csl-counselor-info">
                        <h4 className="csl-counselor-name">{c.name}</h4>
                        <span className="csl-counselor-spec">{c.specialization || "Expert SAT Counselor"}</span>
                        {c.bio && <p className="csl-counselor-bio">{c.bio}</p>}
                        <div className="csl-counselor-days">
                          {(c.availableDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]).map((d) => (
                            <span key={d} className="csl-day-chip">{d.slice(0, 3)}</span>
                          ))}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="csl-selected-check">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="csl-actions-bar">
              <button type="button" className="csl-btn-secondary" onClick={() => setStep(1)}>
                ← Change Mock Test
              </button>
              <button
                type="button"
                className="csl-btn-primary"
                disabled={!selectedCounselor}
                onClick={() => setStep(3)}
              >
                Continue to Date & Time →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: SELECT DATE & TIME ── */}
        {step === 3 && (
          <div className="csl-step-panel">
            <div className="csl-panel-header">
              <div className="csl-panel-badge csl-badge-blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="csl-panel-header-text">
                <h2 className="csl-panel-title">Select Date & Time</h2>
                <p className="csl-panel-sub">
                  Counselor: <strong>{selectedCounselor?.name || "Aditya Cherikuri"}</strong>
                  {" • "}
                  <span>30-minute session (IST)</span>
                </p>
              </div>
            </div>

            {/* Date Carousel */}
            <div className="csl-date-carousel-wrap">
              <button
                type="button"
                className="csl-carousel-arrow"
                onClick={() => scrollDates("left")}
                aria-label="Previous dates"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div className="csl-date-carousel" ref={dateCarouselRef}>
                {dateOptions.map((d) => {
                  const dateObj = new Date(d + "T12:00:00+05:30");
                  const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" }).toUpperCase();
                  const dayNum = dateObj.toLocaleDateString("en-US", { day: "numeric", timeZone: "Asia/Kolkata" });
                  const month = dateObj.toLocaleDateString("en-US", { month: "short", timeZone: "Asia/Kolkata" }).toUpperCase();
                  const isSelected = selectedDate === d;

                  return (
                    <button
                      type="button"
                      key={d}
                      className={`csl-date-chip ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setSelectedDate(d)}
                    >
                      <span className="csl-chip-day">{weekday}</span>
                      <span className="csl-chip-num">{dayNum}</span>
                      <span className="csl-chip-month">{month}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="csl-carousel-arrow"
                onClick={() => scrollDates("right")}
                aria-label="Next dates"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <h3 className="csl-slots-heading">
              Available Slots for {formatHeadingDate(selectedDate)}
            </h3>

            {loadingSlots ? (
              <div className="csl-loading">Loading available slots...</div>
            ) : slots.length === 0 ? (
              <div className="csl-no-slots">
                {slotLoadError || "No slots available on this date. Please select another date."}
              </div>
            ) : (
              <div className="csl-slots-section">
                {["Morning", "Afternoon", "Evening"].filter(g => groupedSlots[g]?.length).map((group) => (
                  <div key={group} className="csl-slot-group">
                    <h5 className="csl-slot-group-title">{group.toUpperCase()}</h5>
                    <div className="csl-slot-pills-grid">
                      {groupedSlots[group].map((slot, i) => {
                        const isSelected = selectedSlot?.startTime === slot.startTime;
                        const isBooked = Boolean(slot.isBooked);
                        return (
                          <button
                            type="button"
                            key={slot._id || i}
                            className={`csl-slot-pill ${isSelected ? "is-selected" : ""} ${isBooked ? "is-booked" : ""}`}
                            disabled={isBooked}
                            onClick={() => setSelectedSlot(slot)}
                          >
                            {formatTime(slot.startTime)} – {formatTime(slot.endTime)}{isBooked ? " · Booked" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="csl-actions-bar">
              <button type="button" className="csl-btn-secondary" onClick={() => setStep(2)}>
                ← Back to Counselor
              </button>
              <button
                type="button"
                className="csl-btn-primary"
                disabled={!selectedSlot}
                onClick={() => setStep(4)}
              >
                Review Booking →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: CONFIRM & BOOK ── */}
        {step === 4 && (
          <div className="csl-step-panel">
            <div className="csl-panel-header">
              <div className="csl-panel-badge csl-badge-blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="csl-panel-header-text">
                <h2 className="csl-panel-title">Review & Confirm Booking</h2>
                <p className="csl-panel-sub">Review your session details before confirming.</p>
              </div>
            </div>

            <div className="csl-review-card">
              <div className="csl-review-row">
                <span className="csl-review-label">Mock Test</span>
                <div className="csl-review-val-wrap">
                  <strong>{selectedMock?.mockTestTitle}</strong>
                  <button type="button" className="csl-review-change" onClick={() => setStep(1)}>Change</button>
                </div>
              </div>

              <div className="csl-review-row">
                <span className="csl-review-label">Your Score</span>
                <div className="csl-review-val-wrap">
                  <strong>{selectedMock?.mockTestScore} / 1600</strong>
                </div>
              </div>

              <div className="csl-review-row">
                <span className="csl-review-label">Counselor</span>
                <div className="csl-review-val-wrap">
                  <strong>{selectedCounselor?.name}</strong>
                  <button type="button" className="csl-review-change" onClick={() => setStep(2)}>Change</button>
                </div>
              </div>

              <div className="csl-review-row">
                <span className="csl-review-label">Date</span>
                <div className="csl-review-val-wrap">
                  <strong>{formatDate(selectedDate)}</strong>
                  <button type="button" className="csl-review-change" onClick={() => setStep(3)}>Change</button>
                </div>
              </div>

              <div className="csl-review-row">
                <span className="csl-review-label">Time</span>
                <div className="csl-review-val-wrap">
                  <strong>{formatTime(selectedSlot?.startTime)} – {formatTime(selectedSlot?.endTime)} IST</strong>
                  <button type="button" className="csl-review-change" onClick={() => setStep(3)}>Change</button>
                </div>
              </div>

              <div className="csl-review-row">
                <span className="csl-review-label">Duration</span>
                <div className="csl-review-val-wrap">
                  <strong>30 Minutes</strong>
                </div>
              </div>

              <div className="csl-review-row is-total">
                <span className="csl-review-label">Total Amount</span>
                <div className="csl-review-val-wrap">
                  <strong className="csl-price-total">{isFree ? "FREE" : "INR 999"}</strong>
                </div>
              </div>
            </div>

            {message && (
              <div className={`csl-form-message ${isError ? "is-error" : "is-success"}`}>
                {message}
              </div>
            )}

            <div className="csl-actions-bar">
              <button type="button" className="csl-btn-secondary" onClick={() => setStep(3)}>
                ← Change Time Slot
              </button>
              <button
                type="button"
                className="csl-btn-primary"
                disabled={processing}
                onClick={handleConfirm}
              >
                {processing ? "Processing Booking..." : isFree ? "Confirm Free Session" : "Pay INR 999 & Confirm"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: SUCCESS / CONFIRMED ── */}
        {step === 5 && confirmed && (
          <div className="csl-step-panel csl-success-panel">
            <div className="csl-success-icon-wrap">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="csl-success-title">Counseling Session Confirmed!</h2>
            <p className="csl-success-sub">
              Your 30-minute SAT guidance session has been booked successfully.
            </p>

            <div className="csl-review-card" style={{ maxWidth: "560px", margin: "24px auto" }}>
              <div className="csl-review-row">
                <span className="csl-review-label">Counselor</span>
                <strong>{booking?.counselorName || selectedCounselor?.name}</strong>
              </div>
              <div className="csl-review-row">
                <span className="csl-review-label">Mock Test</span>
                <strong>{selectedMock?.mockTestTitle}</strong>
              </div>
              <div className="csl-review-row">
                <span className="csl-review-label">Date & Time</span>
                <strong>
                  {formatDate(booking?.bookingDate || selectedDate)} at {formatTime(booking?.startTime || selectedSlot?.startTime)} IST
                </strong>
              </div>
              {booking?.meetingLink && (
                <div className="csl-review-row">
                  <span className="csl-review-label">Google Meet</span>
                  <a href={booking.meetingLink} target="_blank" rel="noreferrer" className="csl-join-link">
                    Join Google Meet →
                  </a>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "20px" }}>
              <Link to="/sat/dashboard?tab=counseling" className="csl-btn-primary" style={{ textDecoration: "none" }}>
                View in Dashboard
              </Link>
              <Link to="/sat/mock-tests" className="csl-btn-secondary" style={{ textDecoration: "none" }}>
                Back to Mock Tests
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

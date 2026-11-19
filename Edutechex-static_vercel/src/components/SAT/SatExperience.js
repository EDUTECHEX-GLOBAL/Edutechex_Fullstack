import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import "./sat.css";
import "./dashboard/satDashboard.css";
import edutechLogo from "../../assets/Edutech-logo.svg";
import Login from "./login/login";
import { EDUTECHEX_LOGO_PNG } from "./edutechLogoBase64";
import SatDashboard from "./dashboard/SatDashboard";
import SatSubscription from "../SAT-subscription/pay";

const STORAGE_KEY = "edutechex-sat-registration";
const RESULT_KEY = "edutechex-sat-last-result";
const SAT_API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

function satAuthHeaders() {
  try {
    const student = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "null");
    return student?.token ? { Authorization: `Bearer ${student.token}` } : {};
  } catch (_) {
    return {};
  }
}

const curricula = ["CBSE", "ICSE", "State Board", "IB", "Cambridge/IGCSE", "Other"];
const genders = ["Male", "Female", "Other", "Prefer not to say"];
const countryCodes = [{ code: "+1", label: "US/CA" }, { code: "+44", label: "UK" }, { code: "+61", label: "AU" }, { code: "+91", label: "IN" }, { code: "+971", label: "AE" }];
// The supplied mock files use these four module timings.
const moduleMinutes = [32, 32, 35, 35];
const testDurationMinutes = moduleMinutes.reduce((total, minutes) => total + minutes, 0);
const sectionBreakMinutes = 10;
// All 150 SAT mock papers present in public/sat-mocks.
const availableTestNumbers = Array.from({ length: 150 }, (_, index) => index + 1);

const tests = availableTestNumbers.map((number) => {
  const pad = String(number).padStart(2, "0");
  return {
    id: pad,
    title: `Full SAT Mock ${pad}`,
    file: `/sat-mocks/EduTechEx_Full_SAT_Mock_${pad}.html`,
    questionCount: 98,
    durationMinutes: testDurationMinutes,
    breakMinutes: sectionBreakMinutes,
  };
});

function isFreeTest(test) {
  return Number(test?.id) <= 3;
}

function canAccessTest(test, subscription) {
  return isFreeTest(test) || subscription.active || subscription.unlockedTestIds.includes(test.id);
}

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

function getTestPack(testId) {
  const pad = String(testId).padStart(2, "0");
  const found = MOCK_PACKS.find((pack) => pack.includes(pad));
  return found || MOCK_PACKS[0];
}

function hasSignedInStudent() {
  try {
    const student = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "null");
    return Boolean(student?.email && student?.token);
  } catch (_) {
    return false;
  }
}


function useSatSubscription() {
  const [access, setAccess] = useState(() => {
    try {
      const student = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "null");
      const cached = JSON.parse(
        sessionStorage.getItem("edutechex-sat-subscription-active") ||
        localStorage.getItem("edutechex-sat-subscription-active") ||
        "null"
      );
      if (cached && cached.email && student?.email && cached.email.toLowerCase() !== student.email.toLowerCase()) {
        return { loading: true, active: false, hasPurchase: false, unlockedTestIds: [], expiresAt: null, error: "" };
      }
      if (cached && cached.active) {
        return { loading: false, active: true, hasPurchase: true, unlockedTestIds: cached.unlockedTestIds || [], expiresAt: cached.expiresAt || null, error: "" };
      }
      if (cached && Array.isArray(cached.unlockedTestIds)) {
        return { loading: false, active: false, hasPurchase: cached.unlockedTestIds.length > 0, unlockedTestIds: cached.unlockedTestIds, expiresAt: cached.expiresAt || null, error: "" };
      }
    } catch (_) {}
    return { loading: true, active: false, hasPurchase: false, unlockedTestIds: [], expiresAt: null, error: "" };
  });

  useEffect(() => {
    let student = null;
    try {
      student = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "null");
    } catch (_) {}
    const email = student?.email?.trim().toLowerCase();
    if (!email) {
      setAccess({ loading: false, active: false, hasPurchase: false, unlockedTestIds: [], expiresAt: null, error: "Sign in to check your SAT subscription." });
      return undefined;
    }

    let active = true;
    const checkSubscription = () => {
      fetch(`${SAT_API_URL}/pay/subscription`, { headers: satAuthHeaders() })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not check your subscription.");
          if (active) {
            const isActive = Boolean(data.fullAccess ?? data.active);
            const unlockedTestIds = Array.isArray(data.unlockedTestIds) ? data.unlockedTestIds : [];
            const hasPurchase = Boolean(data.hasPurchase || isActive || unlockedTestIds.length);
            const subObj = { email, active: isActive, hasPurchase, unlockedTestIds, expiresAt: data.expiresAt || null };
            sessionStorage.setItem("edutechex-sat-subscription-active", JSON.stringify(subObj));
            localStorage.setItem("edutechex-sat-subscription-active", JSON.stringify(subObj));
            setAccess({ loading: false, active: isActive, hasPurchase, unlockedTestIds, expiresAt: data.expiresAt || null, error: "" });
          }
        })
        .catch((error) => {
          if (active) {
            try {
              const cached = JSON.parse(
                sessionStorage.getItem("edutechex-sat-subscription-active") ||
                localStorage.getItem("edutechex-sat-subscription-active") ||
                "null"
              );
              if (cached && (!cached.email || cached.email.toLowerCase() === email)) {
                if (cached.active) {
                  setAccess({ loading: false, active: true, hasPurchase: true, unlockedTestIds: cached.unlockedTestIds || [], expiresAt: cached.expiresAt || null, error: "" });
                  return;
                }
                if (Array.isArray(cached.unlockedTestIds)) {
                  setAccess({ loading: false, active: false, hasPurchase: cached.unlockedTestIds.length > 0, unlockedTestIds: cached.unlockedTestIds, expiresAt: cached.expiresAt || null, error: "" });
                  return;
                }
              }
            } catch (_) {}
            setAccess({ loading: false, active: false, hasPurchase: false, unlockedTestIds: [], expiresAt: null, error: error.message || "Could not verify your subscription. Please try again." });
          }
        });
    };
    checkSubscription();
    const refreshTimer = window.setInterval(checkSubscription, 30000);
    window.addEventListener("focus", checkSubscription);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", checkSubscription);
    };
  }, []);

  return access;
}

function SubscriptionRequired({ loading, error, testId }) {
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  return (
    <main className="sat-page sat-mock-dashboard-page">
      <section className="sat-access-required" role="status">
        <h1>{loading ? "Checking your subscription…" : "10-Paper Pack Required"}</h1>
        <p>
          {loading
            ? "Please wait while we verify your access."
            : error || "Your first three SAT mock papers are free. Buy the 10-paper pack (Papers 04–14) for ₹999."}
        </p>
        {!loading && (
          <button
            type="button"
            className="sat-access-subscribe"
            onClick={() => setShowSubscriptionModal(true)}
            style={{ cursor: "pointer", border: "none" }}
          >
            Buy 10 Mock Papers for ₹999 →</button>
        )}
      </section>

      {showSubscriptionModal && (
        <SatSubscription
          isModal={true}
          selectedTestIds={testId ? getTestPack(testId) : null}
          onClose={() => setShowSubscriptionModal(false)}
          onSubscribed={() => {
            setShowSubscriptionModal(false);
            window.location.reload();
          }}
        />
      )}
    </main>
  );
}

function SatShell({ children }) {
  return (
    <main className="sat-page">
      <div className="sat-container">
        {children}
      </div>
    </main>
  );
}

const heroFeatures = [
  {
    title: "Global Opportunities",
    text: "Explore top universities worldwide",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M2.5 12h19" />
        <path d="M12 2.5c2.6 2.7 4 6 4 9.5s-1.4 6.8-4 9.5c-2.6-2.7-4-6-4-9.5s1.4-6.8 4-9.5z" />
      </svg>
    ),
  },
  {
    title: "Top Rankings",
    text: "Find the best programs for your goals",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 10h4v10H4zM10 4h4v16h-4zM16 13h4v7h-4z" />
      </svg>
    ),
  },
  {
    title: "Brighter Future",
    text: "Get the right guidance, every step",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
];

function Registration() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", countryCode: "+91", phone: "", gender: "", curriculum: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [genderOpen, setGenderOpen] = useState(false);
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [countryCodeOpen, setCountryCodeOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // OTP Modal State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [registrationId, setRegistrationId] = useState("");
  const [otpCode, setOtpCode] = useState(Array(6).fill(""));
  const [otpError, setOtpError] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");
  const otpRefs = useRef([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (showOtpModal) {
      setTimeout(() => {
        otpRefs.current[0]?.focus();
      }, 100);
    }
  }, [showOtpModal]);

  const validateName = (val) => {
    const trimmed = (val || "").trim();
    if (!trimmed) return "Enter your full name.";
    if (/\d/.test(trimmed)) return "Name cannot contain numbers.";
    if (!/^[a-zA-Z\s.'-]+$/.test(trimmed)) return "Name can only contain letters, spaces, hyphens, or apostrophes.";
    const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
    if (letterCount < 2) return "Enter a valid name with at least 2 letters.";
    if (trimmed.length > 80) return "Name cannot exceed 80 characters.";
    return "";
  };

  const sanitizeEmail = (val) => {
    if (!val) return "";
    let cleaned = val.replace(/\s/g, "");

    // Disallow multiple @ symbols (keep only the first @)
    const firstAt = cleaned.indexOf("@");
    if (firstAt !== -1) {
      cleaned = cleaned.slice(0, firstAt + 1) + cleaned.slice(firstAt + 1).replace(/@/g, "");
    }

    // Disallow appending characters/numbers after completed major domains:
    // e.g. @gmail.com123 or @gmail.comxyz -> @gmail.com
    cleaned = cleaned.replace(
      /(@(?:gmail|yahoo|outlook|hotmail|icloud|edutechex|zoho|proton|live)\.(?:com|in|org|net|edu|co\.in|me)).*/i,
      (match, domain) => domain
    );

    // Disallow numbers or invalid characters in the domain's top-level extension (after the last dot)
    const atIdx = cleaned.indexOf("@");
    if (atIdx !== -1) {
      const local = cleaned.slice(0, atIdx);
      const domain = cleaned.slice(atIdx + 1);
      const lastDot = domain.lastIndexOf(".");
      if (lastDot !== -1) {
        const preTld = domain.slice(0, lastDot + 1);
        const tld = domain.slice(lastDot + 1);
        // TLD can only be letters
        const lettersOnlyTld = tld.replace(/[^a-zA-Z]/g, "");
        cleaned = `${local}@${preTld}${lettersOnlyTld}`;
      }
    }

    return cleaned;
  };

  const validateEmail = (val) => {
    const trimmed = (val || "").trim();
    if (!trimmed) return "Enter your email address.";
    if (trimmed.length > 254) return "Email address is too long.";
    if (trimmed.includes("..")) return "Email cannot contain consecutive dots.";

    // If typing a major domain like @gmail, ensure it ends with @gmail.com
    if (/@gmail\.[a-zA-Z]+/i.test(trimmed) && !/@gmail\.com$/i.test(trimmed)) {
      return "Gmail addresses must end with @gmail.com.";
    }

    // Strictly validate email: local@domain.tld where TLD is 2 to 10 letters only (no numbers allowed in/after TLD)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,10}$/;
    if (!emailRegex.test(trimmed)) {
      const lastDotIndex = trimmed.lastIndexOf(".");
      if (lastDotIndex > trimmed.indexOf("@") && lastDotIndex !== -1) {
        const ext = trimmed.slice(lastDotIndex + 1);
        if (/\d/.test(ext)) {
          return "Domain extension cannot contain numbers (e.g. use .com instead of .com123).";
        }
      }
      return "Enter a valid email address (e.g. you@example.com).";
    }
    return "";
  };

  const validatePhone = (val) => {
    const digitsOnly = (val || "").replace(/\D/g, "");
    if (!digitsOnly) return "Enter your phone number.";
    if (digitsOnly.length < 10) {
      return `Enter a valid 10-digit phone number (${digitsOnly.length}/10 digits entered).`;
    }
    if (digitsOnly.length > 10) {
      return "Phone number must not exceed 10 digits.";
    }
    if (/^(\d)\1{9}$/.test(digitsOnly)) {
      return "Enter a valid 10-digit phone number.";
    }
    return "";
  };

  const validateGender = (val) => {
    if (!val) return "Select your gender.";
    return "";
  };

  const validateCurriculum = (val) => {
    if (!val) return "Select your curriculum.";
    return "";
  };

  const validatePassword = (val) => {
    if (!val) return "Create a password.";
    if (val.length < 8 || !/[A-Za-z]/.test(val) || !/\d/.test(val)) {
      return "Use at least 8 characters, including a letter and a number, for your password.";
    }
    return "";
  };

  const handleNameChange = (event) => {
    // Disallow numbers and illegal characters as user types
    const filtered = event.target.value.replace(/[^a-zA-Z\s.'-]/g, "");
    setForm((prev) => ({ ...prev, name: filtered }));
    if (touched.name) {
      setFieldErrors((prev) => ({ ...prev, name: validateName(filtered) }));
    }
  };

  const handleEmailChange = (event) => {
    const cleaned = sanitizeEmail(event.target.value);
    setForm((prev) => ({ ...prev, email: cleaned }));

    const hasDomainDot = cleaned.includes("@") && cleaned.split("@")[1]?.includes(".");
    if (touched.email || hasDomainDot) {
      setFieldErrors((prev) => ({ ...prev, email: validateEmail(cleaned) }));
    } else {
      setFieldErrors((prev) => ({ ...prev, email: "" }));
    }
  };

  const handlePhoneChange = (event) => {
    // Only allow digits, max 10 digits
    const digitsOnly = event.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((prev) => ({ ...prev, phone: digitsOnly }));
    if (touched.phone) {
      setFieldErrors((prev) => ({ ...prev, phone: validatePhone(digitsOnly) }));
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    let err = "";
    if (field === "name") err = validateName(form.name);
    else if (field === "email") err = validateEmail(form.email);
    else if (field === "phone") err = validatePhone(form.phone);
    else if (field === "gender") err = validateGender(form.gender);
    else if (field === "curriculum") err = validateCurriculum(form.curriculum);
    else if (field === "password") err = validatePassword(form.password);
    setFieldErrors((prev) => ({ ...prev, [field]: err }));
  };

  const update = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (touched[name]) {
      if (name === "password") {
        setFieldErrors((prev) => ({ ...prev, password: validatePassword(value) }));
      }
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const nameErr = validateName(form.name);
    const emailErr = validateEmail(form.email);
    const phoneErr = validatePhone(form.phone);
    const genderErr = validateGender(form.gender);
    const curriculumErr = validateCurriculum(form.curriculum);
    const passwordErr = validatePassword(form.password);

    const errors = {
      name: nameErr,
      email: emailErr,
      phone: phoneErr,
      gender: genderErr,
      curriculum: curriculumErr,
      password: passwordErr,
    };

    setTouched({
      name: true,
      email: true,
      phone: true,
      gender: true,
      curriculum: true,
      password: true,
    });
    setFieldErrors(errors);

    const firstError = nameErr || emailErr || phoneErr || genderErr || curriculumErr || passwordErr;
    if (firstError) {
      setMessage(firstError);
      if (nameErr) document.getElementById("sat-name")?.focus();
      else if (emailErr) document.getElementById("sat-email")?.focus();
      else if (phoneErr) document.getElementById("sat-phone")?.focus();
      else if (passwordErr) document.getElementById("sat-password")?.focus();
      return;
    }

    setSubmitting(true);
    setMessage("");
    const name = form.name.trim();
    const email = form.email.trim();
    const phoneDigits = form.phone.replace(/\D/g, "");
    try {
      const fullPhone = `${form.countryCode} ${phoneDigits}`;
      const response = await fetch(`${SAT_API_URL}/sat/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: fullPhone, gender: form.gender, curriculum: form.curriculum, password: form.password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Registration could not be completed.");
      // The password is intentionally NOT kept in browser storage.
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name, email, phone: fullPhone, gender: form.gender, curriculum: form.curriculum, registrationId: result.id }));
      setRegistrationId(result.id);
      setOtpCode(Array(6).fill(""));
      setOtpError("");
      setResendMessage("");
      setResendCooldown(30);
      setShowOtpModal(true);
    } catch (error) {
      setMessage(error.message || "Could not connect to the SAT backend. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async (event) => {
    if (event) event.preventDefault();
    if (otpCode.length !== 6 || otpCode.some((digit) => !digit)) {
      setOtpError("Enter all six digits of the verification code sent to your email.");
      return;
    }
    if (!registrationId) {
      setOtpError("Registration session missing. Please register again.");
      return;
    }
    setOtpVerifying(true);
    setOtpError("");
    try {
      const response = await fetch(`${SAT_API_URL}/sat/registrations/${registrationId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode.join("") }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Verification could not be completed.");
      if (!result.token) throw new Error("Student sign-in could not be created. Please sign in again.");
      const savedStudent = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
      const fullStudent = { ...savedStudent, token: result.token };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fullStudent));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fullStudent));
      setOtpSuccess(true);
      setTimeout(() => {
        navigate("/sat/dashboard");
      }, 900);
    } catch (err) {
      setOtpError(err.message || "The verification code is incorrect.");
    } finally {
      setOtpVerifying(false);
    }
  };

  const changeOtpDigit = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpCode];
    next[index] = digit;
    setOtpCode(next);
    setOtpError("");
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (digit && index === 5 && next.every((d) => Boolean(d))) {
      setTimeout(() => {
        verifyOtp();
      }, 150);
    }
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event) => {
    const text = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length) {
      event.preventDefault();
      const digits = text.split("");
      const newCode = [...digits, ...Array(6 - digits.length).fill("")];
      setOtpCode(newCode);
      setOtpError("");
      otpRefs.current[Math.min(digits.length, 5)]?.focus();
      if (digits.length === 6) {
        setTimeout(() => {
          verifyOtp();
        }, 150);
      }
    }
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpError("");
    setResendMessage("");
    try {
      const name = form.name.trim();
      const email = form.email.trim();
      const phone = form.phone.trim();
      const phoneDigits = phone.replace(/\D/g, "");
      const fullPhone = `${form.countryCode} ${phoneDigits}`;
      const response = await fetch(`${SAT_API_URL}/sat/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: fullPhone, gender: form.gender, curriculum: form.curriculum, password: form.password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not resend code.");
      if (result.id) {
        setRegistrationId(result.id);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name, email, phone: fullPhone, gender: form.gender, curriculum: form.curriculum, registrationId: result.id }));
      }
      setResendMessage("A new verification code has been sent to your email.");
      setResendCooldown(30);
    } catch (err) {
      setOtpError(err.message || "Failed to resend code. Please try again.");
    }
  };

  return (
    <main className="sat-page sat-register-page">
      {/* Top Navbar: Brand logo on left, Login action on right top */}
      <header className="sat-auth-navbar">
        <Link to="/" className="sat-auth-nav-brand" aria-label="EduTechEx Home">
          <img src={edutechLogo} alt="EDUTECHEX" className="sat-auth-nav-logo" />
        </Link>
        <div className="sat-auth-nav-right">
          <span className="sat-auth-nav-prompt">Already have an account?</span>
          <Link to="/sat/login" className="sat-nav-login-btn" id="sat-login-btn" aria-label="Log in to your account">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            <span>Log In</span>
          </Link>
        </div>
      </header>

      <div className="sat-register-container">
        {/* Left column: branding + hero copy */}
        <section className="sat-register-hero">
          <div className="sat-hero-badge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
            </svg>
            <span>Your Global Education Partner</span>
          </div>

          <h1 className="sat-hero-title">
            Your Future<br /><span>Starts Here</span>
          </h1>

          <p className="sat-hero-subtitle">
            Take the next step towards your dream university with EduTechEX. Get expert guidance, personalized recommendations and build a brighter future.
          </p>

          <div className="sat-hero-features">
            {heroFeatures.map((feature) => (
              <div className="sat-feature-item" key={feature.title}>
                <span className="sat-feature-icon" aria-hidden="true">{feature.icon}</span>
                <span className="sat-feature-copy">
                  <strong className="sat-feature-title">{feature.title}</strong>
                  <span className="sat-feature-text">{feature.text}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Right column: registration card */}
        <div className="sat-register-card-wrap">
          <section className="sat-card sat-register-card">
            <div className="sat-stepper" aria-label="Step 1 of 3">
              <span className="sat-step-dot is-active" aria-current="step">01</span>
              <span className="sat-step-line" aria-hidden="true" />
              <span className="sat-step-dot">02</span>
              <span className="sat-step-line" aria-hidden="true" />
              <span className="sat-step-dot">03</span>
            </div>

            <div className="sat-card-intro">
              <h1>Create Your Account</h1>
              <p>Join EduTechEX and take the first step towards your dream university.</p>
            </div>

            <form className="sat-form" onSubmit={submit} noValidate>
              <div className="sat-field-group">
                <label className="sat-input-label" htmlFor="sat-name">Full Name <span className="sat-required">*</span></label>
                <div className={`sat-input-wrapper ${touched.name && fieldErrors.name ? "is-invalid" : ""}`}>
                  <span className="sat-input-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                  <input
                    id="sat-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Enter your full name"
                    value={form.name}
                    onChange={handleNameChange}
                    onBlur={() => handleBlur("name")}
                    required
                  />
                </div>
                {touched.name && fieldErrors.name && (
                  <span className="sat-field-error" role="alert">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{fieldErrors.name}</span>
                  </span>
                )}
              </div>

              <div className="sat-field-group">
                <label className="sat-input-label" htmlFor="sat-email">Email Address <span className="sat-required">*</span></label>
                <div className={`sat-input-wrapper ${(touched.email || (form.email.includes("@") && form.email.split("@")[1]?.includes("."))) && fieldErrors.email ? "is-invalid" : ""}`}>
                  <span className="sat-input-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  </span>
                  <input
                    id="sat-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={handleEmailChange}
                    onBlur={() => handleBlur("email")}
                    required
                  />
                </div>
                {(touched.email || (form.email.includes("@") && form.email.split("@")[1]?.includes("."))) && fieldErrors.email && (
                  <span className="sat-field-error" role="alert">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{fieldErrors.email}</span>
                  </span>
                )}
              </div>

              <div className="sat-form-row">
                <div className="sat-field-group sat-phone-field-group">
                  <label className="sat-input-label" htmlFor="sat-phone">Phone Number <span className="sat-required">*</span></label>
                  <div className={`sat-phone-combined ${touched.phone && fieldErrors.phone ? "is-invalid" : ""}`}>
                    <div className="sat-country-select">
                      <button className="sat-country-trigger" type="button" aria-label="Country calling code" aria-haspopup="listbox" aria-expanded={countryCodeOpen} onClick={() => { setCountryCodeOpen((open) => !open); setGenderOpen(false); setCurriculumOpen(false); }}>
                        <span className="sat-country-trigger-main">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          <span>{form.countryCode}</span>
                        </span>
                        <svg className="sat-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                      </button>
                      {countryCodeOpen && (
                        <div className="sat-country-options" role="listbox" aria-label="Country calling code">
                          {countryCodes.map(({ code, label }) => (
                            <button key={code} type="button" role="option" aria-selected={form.countryCode === code} className="sat-curriculum-option" onClick={() => { setForm((current) => ({ ...current, countryCode: code })); setCountryCodeOpen(false); }}>
                              {code} {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="sat-phone-input-wrap">
                      <input
                        id="sat-phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        pattern="[0-9]*"
                        autoComplete="tel-national"
                        placeholder="10-digit mobile number"
                        value={form.phone}
                        onChange={handlePhoneChange}
                        onBlur={() => handleBlur("phone")}
                        required
                      />
                    </div>
                  </div>
                  {touched.phone && fieldErrors.phone && (
                    <span className="sat-field-error" role="alert">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{fieldErrors.phone}</span>
                    </span>
                  )}
                </div>

                <div className="sat-field-group sat-gender-field-group">
                  <span className="sat-input-label" id="sat-gender-label">Gender <span className="sat-required">*</span></span>
                  <div className="sat-curriculum-select">
                    <button className={`sat-curriculum-trigger ${touched.gender && fieldErrors.gender ? "is-invalid" : ""}`} type="button" aria-labelledby="sat-gender-label" aria-haspopup="listbox" aria-expanded={genderOpen} onClick={() => { setGenderOpen((open) => !open); setCountryCodeOpen(false); setCurriculumOpen(false); }}>
                      <span className="sat-curriculum-trigger-left">
                        <svg className="sat-book-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span className={form.gender ? "sat-val-selected" : "sat-val-placeholder"}>{form.gender || "Select your gender"}</span>
                      </span>
                      <svg className="sat-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    {genderOpen && (
                      <div className="sat-curriculum-options" role="listbox" aria-label="Gender">
                        {genders.map((item) => (
                          <button key={item} type="button" role="option" aria-selected={form.gender === item} className="sat-curriculum-option" onClick={() => { setForm((current) => ({ ...current, gender: item })); setGenderOpen(false); setFieldErrors((prev) => ({ ...prev, gender: "" })); }}>
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {touched.gender && fieldErrors.gender && (
                    <span className="sat-field-error" role="alert">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{fieldErrors.gender}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="sat-form-row">
                <div className="sat-field-group sat-curriculum-field-group">
                  <span className="sat-input-label" id="sat-curriculum-label">Curriculum <span className="sat-required">*</span></span>
                  <div className="sat-curriculum-select">
                    <button className={`sat-curriculum-trigger ${touched.curriculum && fieldErrors.curriculum ? "is-invalid" : ""}`} type="button" aria-labelledby="sat-curriculum-label" aria-haspopup="listbox" aria-expanded={curriculumOpen} onClick={() => { setCurriculumOpen((open) => !open); setGenderOpen(false); setCountryCodeOpen(false); }}>
                      <span className="sat-curriculum-trigger-left">
                        <svg className="sat-book-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                        </svg>
                        <span className={form.curriculum ? "sat-val-selected" : "sat-val-placeholder"}>{form.curriculum || "Select your curriculum"}</span>
                      </span>
                      <svg className="sat-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    {curriculumOpen && (
                      <div className="sat-curriculum-options" role="listbox" aria-label="Curriculum">
                        {curricula.map((item) => (
                          <button key={item} type="button" role="option" aria-selected={form.curriculum === item} className="sat-curriculum-option" onClick={() => { setForm((current) => ({ ...current, curriculum: item })); setCurriculumOpen(false); setFieldErrors((prev) => ({ ...prev, curriculum: "" })); }}>
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {touched.curriculum && fieldErrors.curriculum && (
                    <span className="sat-field-error" role="alert">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{fieldErrors.curriculum}</span>
                    </span>
                  )}
                </div>

                <div className="sat-field-group sat-password-field-group">
                  <label className="sat-input-label" htmlFor="sat-password">Password <span className="sat-required">*</span></label>
                  <div className={`sat-input-wrapper ${touched.password && fieldErrors.password ? "is-invalid" : ""}`}>
                    <span className="sat-input-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                    <input
                      id="sat-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      value={form.password}
                      onChange={update}
                      onBlur={() => handleBlur("password")}
                      required
                    />
                    <button className="sat-eye-btn" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="m1 1 22 22"/></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                  {touched.password && fieldErrors.password && (
                    <span className="sat-field-error" role="alert">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{fieldErrors.password}</span>
                    </span>
                  )}
                </div>
              </div>

              {message && <div className="sat-message sat-message-error" role="alert">{message}</div>}

              <button className="sat-primary-button sat-submit-btn" type="submit" disabled={submitting}>
                {submitting ? "Connecting…" : "Continue"}
                {!submitting && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                )}
              </button>

              <div className="sat-secure-note">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Your information is safe and secure.</span>
              </div>

              <div className="sat-card-switch">
                <span>Already have an account?</span>
                <Link to="/sat/login" className="sat-card-switch-link">Log In</Link>
              </div>
            </form>
          </section>
        </div>
      </div>

      {/* OTP Verification Modal Popup */}
      {showOtpModal && (
        <div className="sat-otp-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sat-otp-modal-title">
          <div className="sat-otp-modal-card">
            <button
              type="button"
              className="sat-otp-modal-close"
              aria-label="Close verification popup"
              onClick={() => setShowOtpModal(false)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="sat-otp-modal-badge">
              <span>Step 02 of 03 · Email Verification</span>
            </div>

            <div className="sat-otp-modal-icon-circle" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>

            <h2 id="sat-otp-modal-title" className="sat-otp-modal-heading">
              Verify Your Email
            </h2>

            <p className="sat-otp-modal-subheading">
              We've sent a 6-digit code to <strong className="sat-otp-target-email">{form.email}</strong>. Please enter it below.
            </p>

            <form onSubmit={verifyOtp} noValidate>
              <div className="sat-otp-boxes" onPaste={handleOtpPaste}>
                {Array.from({ length: 6 }, (_, index) => (
                  <input
                    key={index}
                    ref={(el) => { otpRefs.current[index] = el; }}
                    aria-label={`Digit ${index + 1}`}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={otpCode[index] || ""}
                    onChange={(e) => changeOtpDigit(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    disabled={otpVerifying || otpSuccess}
                    className={otpCode[index] ? "sat-otp-digit is-filled" : "sat-otp-digit"}
                  />
                ))}
              </div>

              {otpError && <div className="sat-message sat-message-error sat-otp-error" role="alert">{otpError}</div>}
              {resendMessage && <div className="sat-message sat-message-info sat-otp-info" role="status">{resendMessage}</div>}
              {otpSuccess && (
                <div className="sat-message sat-message-info sat-otp-success" role="status">
                  ✓ Email verified successfully! Redirecting…
                </div>
              )}

              <button
                className="sat-primary-button sat-submit-btn sat-otp-submit-btn"
                type="submit"
                disabled={otpVerifying || otpSuccess || otpCode.some((d) => !d)}
              >
                {otpVerifying ? "Verifying…" : otpSuccess ? "Verified ✓" : "Verify & Continue"}
                {!otpVerifying && !otpSuccess && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>

              <div className="sat-otp-modal-resend">
                <span>Didn't receive the email? </span>
                {resendCooldown > 0 ? (
                  <span className="sat-resend-timer">Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    className="sat-resend-btn"
                    onClick={resendOtp}
                    disabled={otpVerifying}
                  >
                    Resend code
                  </button>
                )}
              </div>

              <div className="sat-otp-modal-footer">
                <button
                  type="button"
                  className="sat-edit-email-btn"
                  onClick={() => setShowOtpModal(false)}
                >
                  ← Wrong email? Edit registration details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function VerifyOtp() {
  const navigate = useNavigate();
  const [code, setCode] = useState(Array(6).fill(""));
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  let registration = null;
  try { registration = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch { registration = null; }
  const registered = Boolean(registration?.registrationId);
  const otpRefs = useRef([]);

  const changeDigit = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError("");
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const verify = async (event) => {
    event.preventDefault();
    if (code.length !== 6 || code.some((digit) => !digit)) {
      setError("Enter all six digits of the verification code sent to your email.");
      return;
    }
    if (!registration?.registrationId) {
      setError("Please complete registration before verifying your email.");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const response = await fetch(`${SAT_API_URL}/sat/registrations/${registration.registrationId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.join("") }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Verification could not be completed.");
      if (!result.token) throw new Error("Student sign-in could not be created. Please sign in again.");
      const fullStudent = { ...registration, token: result.token };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fullStudent));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fullStudent));
      navigate("/sat/dashboard");
    } catch (verificationError) {
      setError(verificationError.message || "Could not connect to the SAT backend. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const pasteCode = (event) => {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    if (digits.length) {
      event.preventDefault();
      setCode([...digits, ...Array(6 - digits.length).fill("")]);
      otpRefs.current[Math.min(digits.length, 5)]?.focus();
    }
  };
  return (
    <SatShell>
      <section className="sat-card sat-small-card sat-otp-card">
        <div className="sat-stepper" aria-label="Step 2 of 3">
          <span className="sat-step-dot">01</span>
          <span className="sat-step-line" aria-hidden="true" />
          <span className="sat-step-dot is-active" aria-current="step">02</span>
          <span className="sat-step-line" aria-hidden="true" />
          <span className="sat-step-dot">03</span>
        </div>
        <div className="sat-icon-circle" aria-hidden="true">✉</div>
        <h1>Verify Your Email</h1>
        <p>{registered ? `Enter the six-digit code sent to ${registration.email}. It expires in 10 minutes.` : "Complete registration first to receive a verification code."}</p>
        {!registered && <div className="sat-message sat-message-info">Please register before verifying your email.</div>}
        <form className="sat-form" onSubmit={verify}>
          <div className="sat-otp-label">Email verification code</div>
          <div className="sat-otp-boxes">
            {Array.from({ length: 6 }, (_, index) => (
              <input
                key={index}
                ref={(element) => { otpRefs.current[index] = element; }}
                aria-label={`Digit ${index + 1}`}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                value={code[index] || ""}
                onChange={(event) => changeDigit(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && !code[index] && index > 0) otpRefs.current[index - 1]?.focus();
                }}
                onPaste={index === 0 ? pasteCode : undefined}
              />
            ))}
          </div>
          {error && <div className="sat-message sat-message-error" role="alert">{error}</div>}
          <button className="sat-primary-button" disabled={verifying || !registered}>{verifying ? "Verifying…" : "Verify & Continue"} {!verifying && <span aria-hidden="true">→</span>}</button>
        </form>
        <Link to="/sat/register" className="sat-back-link">← Back to Registration</Link>
      </section>
    </SatShell>
  );
}

function MockTests() {
  return <SatDashboard initialTab="papers" />;
}

function TestInstructions() {
  const { testId } = useParams();
  const [acknowledged, setAcknowledged] = useState(false);
  const subscription = useSatSubscription();
  const test = tests.find((item) => item.id === testId);
  if (!test) return <SatNotFound />;
  const canAccessSelectedTest = canAccessTest(test, subscription);
  if (!hasSignedInStudent() || (subscription.loading && !isFreeTest(test)) || (!subscription.loading && !canAccessSelectedTest)) {
    return <SubscriptionRequired loading={subscription.loading} error={subscription.error} testId={test.id} />;
  }
  return (
    <main className="sat-page sat-mock-dashboard-page">
      <header className="sat-auth-navbar">
        <Link to="/" className="sat-auth-nav-brand" aria-label="EduTechEx Home">
          <img src={edutechLogo} alt="EDUTECHEX" className="sat-auth-nav-logo" />
        </Link>
        <div className="sat-auth-nav-right">
          <Link to="/sat/dashboard" className="sat-instructions-back-btn" id="sat-back-to-mocks-btn">
            <span aria-hidden="true">←</span>
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </header>

      <div className="sat-instructions-container">
        <section className="sat-instructions-card">
          <h1 className="sat-instructions-title">{test.title} – Instructions</h1>

          <div className="sat-instruction-banner">
            <span className="sat-instruction-info-badge" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              </svg>
            </span>
            <p className="sat-instruction-banner-text">
              Please read the instructions carefully before starting <strong>your test</strong>.
            </p>
          </div>

          <div className="sat-instruction-stat-cards">
            {/* Total Questions */}
            <div className="sat-stat-box">
              <div className="sat-stat-icon-wrap" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
              </div>
              <div className="sat-stat-info">
                <span className="sat-stat-label">Total Questions</span>
                <strong className="sat-stat-value">{test.questionCount}</strong>
              </div>
            </div>

            {/* Duration */}
            <div className="sat-stat-box">
              <div className="sat-stat-icon-wrap is-circle" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="sat-stat-info">
                <span className="sat-stat-label">Duration</span>
                <strong className="sat-stat-value">{test.durationMinutes} minutes</strong>
                <span className="sat-stat-sub">Plus {test.breakMinutes}-minute mandatory break</span>
              </div>
            </div>

            {/* Sections */}
            <div className="sat-stat-box">
              <div className="sat-stat-icon-wrap" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="13" x2="16" y2="13" />
                  <line x1="9" y1="17" x2="16" y2="17" />
                  <line x1="9" y1="9" x2="11" y2="9" />
                </svg>
              </div>
              <div className="sat-stat-info">
                <span className="sat-stat-label">Sections</span>
                <strong className="sat-stat-value">Math · Reading · Writing</strong>
              </div>
            </div>
          </div>

          <h2 className="sat-instructions-heading">Instructions</h2>

          <div className="sat-instructions-points">
            <div className="sat-point-item">
              <span className="sat-point-badge">1</span>
              <p className="sat-point-text">The test consists of 3 sections: Math, Reading and Writing.</p>
            </div>
            <div className="sat-point-item">
              <span className="sat-point-badge">2</span>
              <p className="sat-point-text">You cannot go back to previous sections once you submit.</p>
            </div>
            <div className="sat-point-item">
              <span className="sat-point-badge">3</span>
              <p className="sat-point-text">Use the question palette to navigate between questions.</p>
            </div>
            <div className="sat-point-item">
              <span className="sat-point-badge">4</span>
              <p className="sat-point-text">Your answers are saved automatically.</p>
            </div>
            <div className="sat-point-item">
              <span className="sat-point-badge">5</span>
              <p className="sat-point-text">Do not refresh the page or close this browser during the test.</p>
            </div>
            <div className="sat-point-item">
              <span className="sat-point-badge">6</span>
              <p className="sat-point-text">Click "Submit Test" when you have completed all sections.</p>
            </div>
          </div>

          <div className="sat-instructions-footer">
            <label className="sat-instructions-checkbox-label">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="sat-instructions-checkbox"
                id="sat-acknowledge-checkbox"
              />
              <span>I have read and understood the instructions.</span>
            </label>
            <Link
              aria-disabled={!acknowledged}
              className={`sat-start-test-btn ${acknowledged ? "is-enabled" : ""}`}
              onClick={(event) => {
                if (!acknowledged) {
                  event.preventDefault();
                  return;
                }
                sessionStorage.setItem(`edutechex-sat-attempt-${test.id}`, `${Date.now()}`);
              }}
              to={`/sat/mock-tests/${test.id}/attempt`}
              id="sat-start-test-btn"
            >
              <span>Start Test</span>
              <span className="sat-action-arrow" aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function MockTest() {
  const { testId } = useParams();
  const test = tests.find((item) => item.id === testId);
  const navigate = useNavigate();
  const subscription = useSatSubscription();
  const iframeRef = useRef(null);
  const [attemptId] = useState(() => {
    const key = `edutechex-sat-attempt-${testId}`;
    const existingAttempt = sessionStorage.getItem(key);
    if (existingAttempt) return existingAttempt;
    const newAttempt = `${Date.now()}`;
    sessionStorage.setItem(key, newAttempt);
    return newAttempt;
  });
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  const saveResultsAndNavigate = async (iframeData = null) => {
    let moduleScores = iframeData?.modules || null;

    if (!moduleScores) {
      try {
        const cw = iframeRef.current?.contentWindow;
        if (cw && typeof cw.report === "function") {
          moduleScores = [0, 1, 2, 3].map((m) => {
            const r = cw.report(m);
            return {
              moduleNumber: m + 1,
              moduleName: m < 2 ? `Reading & Writing - Module ${m + 1}` : `Math - Module ${m - 1}`,
              score: r.right,
              totalQuestions: r.total,
              wrong: r.wrong,
              blank: r.blank,
              completed: true,
            };
          });
        }
      } catch (err) {
        console.warn("Could not read iframe state:", err);
      }
    }

    // Fallback module structure if iframe could not be read
    if (!moduleScores || !Array.isArray(moduleScores) || moduleScores.length === 0) {
      moduleScores = [
        { moduleNumber: 1, moduleName: "Reading & Writing - Module 1", score: 0, totalQuestions: 27, wrong: 0, blank: 27, completed: true },
        { moduleNumber: 2, moduleName: "Reading & Writing - Module 2", score: 0, totalQuestions: 27, wrong: 0, blank: 27, completed: true },
        { moduleNumber: 3, moduleName: "Math - Module 1", score: 0, totalQuestions: 22, wrong: 0, blank: 22, completed: true },
        { moduleNumber: 4, moduleName: "Math - Module 2", score: 0, totalQuestions: 22, wrong: 0, blank: 22, completed: true },
      ];
    }

    const rawScore = moduleScores.reduce((sum, m) => sum + (Number(m.score) || 0), 0);
    const totalQuestions = moduleScores.reduce((sum, m) => sum + (Number(m.totalQuestions) || 0), 0) || 98;
    const rwCorrect = (Number(moduleScores[0]?.score) || 0) + (Number(moduleScores[1]?.score) || 0);
    const rwTotal = (Number(moduleScores[0]?.totalQuestions) || 27) + (Number(moduleScores[1]?.totalQuestions) || 27);
    const mathCorrect = (Number(moduleScores[2]?.score) || 0) + (Number(moduleScores[3]?.score) || 0);
    const mathTotal = (Number(moduleScores[2]?.totalQuestions) || 22) + (Number(moduleScores[3]?.totalQuestions) || 22);

    const readingWritingScore = iframeData?.rs ?? (200 + Math.round((rwCorrect / rwTotal) * 60) * 10);
    const mathScore = iframeData?.ms ?? (200 + Math.round((mathCorrect / mathTotal) * 60) * 10);
    const scaleScore = iframeData?.totalScale ?? (readingWritingScore + mathScore);

    let reg = null;
    try {
      reg = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    } catch (_) {}

    const payload = {
      studentEmail: reg?.email || "",
      studentName: reg?.name || "Student",
      registrationId: reg?.registrationId || "",
      testId: test.id,
      testTitle: test.title,
      modules: moduleScores,
      rawScore,
      totalQuestions,
      readingWritingScore,
      mathScore,
      scaleScore,
    };

    setSubmitting(true);
    setSubmissionError("");
    try {
      const response = await fetch(`${SAT_API_URL}/sat/mocks/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...satAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || "Could not verify your SAT subscription or save your result.");
        error.status = response.status;
        throw error;
      }
      if (!data?.result) throw new Error("The SAT backend did not return a saved result.");
      const saved = {
        ...data.result,
        rawScore: data.result?.rawScore !== undefined ? data.result.rawScore : rawScore,
        totalQuestions: data.result?.totalQuestions || totalQuestions,
        readingWritingScore: data.result?.readingWritingScore || readingWritingScore,
        mathScore: data.result?.mathScore || mathScore,
        scaleScore: data.result?.scaleScore || scaleScore,
        modules: data.result?.modules || moduleScores,
      };
      sessionStorage.setItem(RESULT_KEY, JSON.stringify(saved));
      localStorage.setItem(RESULT_KEY, JSON.stringify(saved));
      sessionStorage.setItem(`edutechex-sat-attempt-${test.id}`, JSON.stringify(saved));
      localStorage.setItem(`edutechex-sat-attempt-${test.id}`, JSON.stringify(saved));
      navigate(`/sat/results/${saved._id || test.id}`);
    } catch (error) {
      const localSaved = {
        _id: attemptId,
        testId: test.id,
        testTitle: test.title,
        studentName: reg?.name || "Student",
        studentEmail: reg?.email || "",
        modules: moduleScores,
        rawScore,
        totalQuestions,
        readingWritingScore,
        mathScore,
        scaleScore,
        completedAt: new Date().toISOString(),
      };
      sessionStorage.setItem(RESULT_KEY, JSON.stringify(localSaved));
      localStorage.setItem(RESULT_KEY, JSON.stringify(localSaved));
      sessionStorage.setItem(`edutechex-sat-attempt-${test.id}`, JSON.stringify(localSaved));
      localStorage.setItem(`edutechex-sat-attempt-${test.id}`, JSON.stringify(localSaved));

      if (error.status === 403) {
        setSubmissionError(error.message || "Purchase the mock pack that includes this mock test.");
      }
      navigate(`/sat/results/${attemptId}`);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === "SAT_MOCK_COMPLETED") {
        saveResultsAndNavigate(event.data);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test]);

  if (!test) return <SatNotFound />;
  const canAccessSelectedTest = canAccessTest(test, subscription);
  if (!hasSignedInStudent() || (subscription.loading && !isFreeTest(test)) || (!subscription.loading && !canAccessSelectedTest)) {
    return <SubscriptionRequired loading={subscription.loading} error={subscription.error} testId={test.id} />;
  }

  return (
    <main className="sat-page sat-test-page">
      <div className="sat-test-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link to="/sat/mock-tests" className="sat-toolbar-back-link">
            <span aria-hidden="true">←</span>
            <span>All Mocks</span>
          </Link>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <strong style={{ fontSize: "14.5px", color: "#0b2550", fontWeight: "700" }}>{test.title}</strong>
        </div>
        <button
          type="button"
          className="sat-finish-practice-btn"
          onClick={() => setShowFinishModal(true)}
          id="sat-finish-practice-btn"
          disabled={submitting}
        >
          {submitting ? "Submitting…" : "Finish Practice"}
        </button>
      </div>

      {submissionError && <div className="sat-test-submit-error" role="alert">{submissionError}</div>}

      <div className="sat-iframe-wrap">
        <iframe
          ref={iframeRef}
          title={`${test.title} practice content`}
          src={`${test.file}?autostart=1&attemptId=${encodeURIComponent(attemptId)}`}
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-same-origin"
          onLoad={() => {
            try {
              const doc = iframeRef.current?.contentDocument;
              if (doc && !doc.getElementById("sat-exam-theme-link")) {
                const link = doc.createElement("link");
                link.id = "sat-exam-theme-link";
                link.rel = "stylesheet";
                link.href = "/sat-mocks/sat-exam-theme.css";
                doc.head.appendChild(link);
              }
            } catch (err) {
              console.warn("Theme injection notice:", err);
            }
          }}
        />
      </div>

      {/* Confirmation Popup Modal */}
      {showFinishModal && (
        <div
          className="sat-confirm-modal-backdrop"
          onClick={() => setShowFinishModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="sat-confirm-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sat-confirm-modal-icon-wrap" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="sat-confirm-modal-title">Finish Practice Test?</h2>
            <p className="sat-confirm-modal-desc">
              Are you sure you want to end your practice test for <strong>{test.title}</strong>? Your responses will be evaluated and your Module 1, Module 2, Module 3, and Module 4 scores will be saved.
            </p>
            <div className="sat-confirm-modal-actions">
              <button
                type="button"
                className="sat-confirm-btn-secondary"
                onClick={() => setShowFinishModal(false)}
                id="sat-keep-practicing-btn"
                disabled={submitting}
              >
                Keep Practicing
              </button>
              <button
                type="button"
                className="sat-confirm-btn-primary"
                onClick={() => {
                  setShowFinishModal(false);
                  saveResultsAndNavigate();
                }}
                id="sat-confirm-finish-btn"
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Finish & View Results →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const generateScoreReportPdf = (finalResult, modules, rwCorrect, mathCorrect, isSubscribed) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let studentData = {};
  try {
    studentData = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch (_) {}

  const studentName = (studentData.name || finalResult.studentName || "Student").toUpperCase();
  const studentEmail = studentData.email || finalResult.studentEmail || "";
  const phone = finalResult.phone || (studentData.countryCode ? `${studentData.countryCode} ${studentData.phone}` : studentData.phone) || "";
  const gender = studentData.gender || finalResult.gender || "Not specified";
  const curriculum = studentData.curriculum || finalResult.curriculum || "General";
  const testId = finalResult.testId || "01";
  const testTitle = finalResult.testTitle || `Full SAT Mock ${testId}`;
  const totalQuestions = finalResult.totalQuestions || 98;
  const rawScore = finalResult.rawScore !== undefined ? finalResult.rawScore : (rwCorrect + mathCorrect);
  const scaleScore = finalResult.scaleScore || (rawScore ? 530 : 1500);
  const rwScore = finalResult.readingWritingScore || (rwCorrect ? 330 : 750);
  const mScore = finalResult.mathScore || (mathCorrect ? 200 : 750);
  const totalPct = Math.round(((rawScore || 0) / (totalQuestions || 98)) * 100);
  const rwPct = Math.round(((rwCorrect || 0) / 54) * 100);
  const mathPct = Math.round(((mathCorrect || 0) / 44) * 100);

  const completedDate = finalResult.completedAt ? new Date(finalResult.completedAt) : new Date();
  const dateFormatted = `${String(completedDate.getDate()).padStart(2, "0")}/${String(completedDate.getMonth() + 1).padStart(2, "0")}/${completedDate.getFullYear()}`;
  const timeFormatted = `${String(completedDate.getHours()).padStart(2, "0")}:${String(completedDate.getMinutes()).padStart(2, "0")}:${String(completedDate.getSeconds()).padStart(2, "0")}`;
  const timestamp = `${dateFormatted}, ${timeFormatted}`;

  // Helper: Section title with signature EduTechEx teal accent underline strictly under first word
  const drawSectionHeading = (title, accentWidth, yPos) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(24, 43, 84); // #182b54 deep navy
    doc.text(title, margin, yPos);

    // Signature teal accent line strictly under first word
    doc.setDrawColor(2, 132, 199); // #0284c7
    doc.setLineWidth(1.1);
    doc.line(margin, yPos + 2, margin + accentWidth, yPos + 2);
  };

  // 1. Top Header: Logo on Left, Document Title on Right
  try {
    if (EDUTECHEX_LOGO_PNG) {
      doc.addImage(EDUTECHEX_LOGO_PNG, "PNG", margin, 10, 44, 9.2);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(24, 43, 84);
      doc.text("EDUTECHEX", margin, 16);
    }
  } catch (_) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(24, 43, 84);
    doc.text("EDUTECHEX", margin, 16);
  }

  // Right Header: Title and Report ID
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(24, 43, 84);
  doc.text("SAT Mock Exam Score Report", pageWidth - margin, 14.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Score Report ID: SAT-2026-${testId}705`, pageWidth - margin, 19.5, { align: "right" });
  doc.text(`Date: ${dateFormatted}`, pageWidth - margin, 24, { align: "right" });

  // 2. Exam Overview Card
  let y = 32;
  drawSectionHeading("Exam Overview", 24, y);

  y += 5.5;
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(224, 242, 254);
  doc.roundedRect(margin, y, contentWidth, 15, 2, 2, "FD");

  const colW = contentWidth / 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(2, 132, 199);
  doc.text("TEST CODE", margin + 6, y + 5);
  doc.text("STATUS", margin + colW + 4, y + 5);
  doc.text("DATE TAKEN", margin + colW * 2 + 4, y + 5);
  doc.text("TOTAL SCORE", margin + colW * 3 + 4, y + 5);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(15, 23, 42);
  doc.text(`SAT-MOCK-${testId}`, margin + 6, y + 10.8);
  doc.setTextColor(22, 163, 74);
  doc.text("Completed", margin + colW + 4, y + 10.8);
  doc.setTextColor(15, 23, 42);
  doc.text(dateFormatted, margin + colW * 2 + 4, y + 10.8);
  doc.setTextColor(2, 132, 199);
  doc.text(`${scaleScore} / 1600`, margin + colW * 3 + 4, y + 10.8);

  // 3. Program Highlight Bar
  y += 21;
  doc.setFillColor(2, 132, 199); // #0284c7
  doc.roundedRect(margin, y, contentWidth, 8, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  doc.text("EduTechEx Global — Official Digital SAT Diagnostic Assessment", margin + 6, y + 5.5);

  y += 13;
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(2, 132, 199);
  doc.text("TEST PAPER & PROGRAM", margin + 6, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(15, 23, 42);
  doc.text(`${testTitle} • Reading & Writing + Mathematics Evaluation`, margin + 6, y + 5);

  // 4. Candidate Details (neatly spaced 2-column layout with ample horizontal separation)
  y += 13.5;
  drawSectionHeading("Candidate Details", 26, y);

  y += 6.5;
  const col1X = margin + 6;
  const col2X = margin + 98;

  const personalRows = [
    ["STUDENT FULL NAME", studentName, "CURRICULUM / BOARD", curriculum],
    ["REGISTERED EMAIL", studentEmail, "CONTACT NUMBER", phone],
    ["GENDER", gender, "TEST TYPE", "Full-Length Timed Mock"],
  ];

  personalRows.forEach(([l1, v1, l2, v2]) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(2, 132, 199);
    doc.text(l1, col1X, y);
    doc.text(l2, col2X, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(15, 23, 42);
    doc.text(v1, col1X, y + 4.8);
    doc.text(v2, col2X, y + 4.8);
    y += 11.5;
  });

  // 5. Performance Overview
  y += 2.5;
  drawSectionHeading("Performance Overview", 28, y);

  y += 6;
  const cardW = (contentWidth - 8) / 3;
  const cardH = 22;

  // Card 1: TOTAL SCORE
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(margin, y, cardW, cardH, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(22, 163, 74);
  doc.text("TOTAL SCORE", margin + 5, y + 5);
  const num1 = String(scaleScore);
  doc.setFontSize(14); doc.setTextColor(21, 128, 61);
  doc.text(num1, margin + 5, y + 11.8);
  const w1 = doc.getTextWidth(num1);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text("/ 1600", margin + 5 + w1 + 2.5, y + 11.8);
  doc.setFontSize(7.2); doc.setTextColor(71, 85, 105);
  doc.text(`Raw: ${rawScore} / ${totalQuestions} questions (${totalPct}%)`, margin + 5, y + 17.2);

  // Card 2: READING & WRITING
  const card2X = margin + cardW + 4;
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(186, 230, 253);
  doc.roundedRect(card2X, y, cardW, cardH, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(2, 132, 199);
  doc.text("READING & WRITING", card2X + 5, y + 5);
  const num2 = String(rwScore);
  doc.setFontSize(14); doc.setTextColor(3, 105, 161);
  doc.text(num2, card2X + 5, y + 11.8);
  const w2 = doc.getTextWidth(num2);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text("/ 800", card2X + 5 + w2 + 2.5, y + 11.8);
  doc.setFontSize(7.2); doc.setTextColor(71, 85, 105);
  doc.text(`${rwCorrect} / 54 questions correct (${rwPct}%)`, card2X + 5, y + 17.2);

  // Card 3: MATHEMATICS
  const card3X = margin + (cardW + 4) * 2;
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(186, 230, 253);
  doc.roundedRect(card3X, y, cardW, cardH, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(2, 132, 199);
  doc.text("MATHEMATICS", card3X + 5, y + 5);
  const num3 = String(mScore);
  doc.setFontSize(14); doc.setTextColor(3, 105, 161);
  doc.text(num3, card3X + 5, y + 11.8);
  const w3 = doc.getTextWidth(num3);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text("/ 800", card3X + 5 + w3 + 2.5, y + 11.8);
  doc.setFontSize(7.2); doc.setTextColor(71, 85, 105);
  doc.text(`${mathCorrect} / 44 questions correct (${mathPct}%)`, card3X + 5, y + 17.2);

  // 6. Module-by-Module Evaluation Table (Exclusive to Subscribed Students)
  if (isSubscribed) {
    y += 28;
    drawSectionHeading("Module-by-Module Evaluation", 40, y);

    y += 5.5;
    // Table Header
    doc.setFillColor(240, 249, 255);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(2, 132, 199);
    doc.text("MODULE NAME", margin + 5, y + 4.8);
    doc.text("QUESTIONS", margin + 78, y + 4.8, { align: "center" });
    doc.text("CORRECT", margin + 104, y + 4.8, { align: "center" });
    doc.text("INCORRECT", margin + 128, y + 4.8, { align: "center" });
    doc.text("BLANK", margin + 152, y + 4.8, { align: "center" });
    doc.text("ACCURACY", margin + 174, y + 4.8, { align: "center" });

    const tableData = modules && modules.length === 4 ? modules : [
      { moduleName: "Reading & Writing - Module 1", totalQuestions: 27, score: 6, wrong: 21, blank: 0 },
      { moduleName: "Reading & Writing - Module 2", totalQuestions: 27, score: 6, wrong: 21, blank: 0 },
      { moduleName: "Math - Module 1", totalQuestions: 22, score: 0, wrong: 0, blank: 22 },
      { moduleName: "Math - Module 2", totalQuestions: 22, score: 0, wrong: 0, blank: 22 },
    ];

    tableData.forEach((r, idx) => {
      y += 7;
      const accuracy = Math.round(((r.score || 0) / (r.totalQuestions || 1)) * 100);
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 7, "F");
      }
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 7, margin + contentWidth, y + 7);

      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(15, 23, 42);
      doc.text(r.moduleName || `Module ${idx + 1}`, margin + 5, y + 4.8);
      doc.text(String(r.totalQuestions || 27), margin + 78, y + 4.8, { align: "center" });

      doc.setFont("helvetica", "bold"); doc.setTextColor(22, 163, 74);
      doc.text(String(r.score || 0), margin + 104, y + 4.8, { align: "center" });

      doc.setTextColor(225, 29, 72);
      doc.text(String(r.wrong || 0), margin + 128, y + 4.8, { align: "center" });

      doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
      doc.text(String(r.blank || 0), margin + 152, y + 4.8, { align: "center" });

      doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
      doc.text(`${accuracy}%`, margin + 174, y + 4.8, { align: "center" });
    });
  } else {
    y += 28;
    drawSectionHeading("Module Evaluation Notice", 38, y);
    y += 5.5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 14, 2, 2, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
    doc.text("Free mock papers include overall scaled score and raw question breakdown.", margin + 5, y + 5.5);
    doc.text("Module-by-module performance and full question analytics unlock with EduTechEx SAT Subscription (Rs 999).", margin + 5, y + 10);
  }

  // 7. Diagnostic Certification Box
  y += 14;
  drawSectionHeading("Diagnostic Certification", 28, y);

  y += 5.5;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, "FD");
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.8); doc.setTextColor(6, 95, 70);
  doc.text(`This official score report certifies that ${studentName} completed the Digital SAT Mock Exam (${testTitle}).`, margin + 5, y + 5.2, { maxWidth: contentWidth - 10 });
  doc.text(`Reading & Writing: ${rwScore}/800 | Mathematics: ${mScore}/800 | Total Scaled Score: ${scaleScore}/1600 (${totalPct}% overall accuracy).`, margin + 5, y + 9.8, { maxWidth: contentWidth - 10 });

  // 8. Running Footer
  const footerY = 282;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  if (EDUTECHEX_LOGO_PNG) {
    try {
      doc.addImage(EDUTECHEX_LOGO_PNG, "PNG", margin, footerY + 2.5, 26, 5.4);
    } catch (_) {}
  }

  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
  doc.text("Support: support@edutechex.com", margin + 30, footerY + 5);
  doc.text("Website: www.ups.edutechex.com", margin + 30, footerY + 9);

  doc.text(`Generated: ${timestamp}`, pageWidth - margin, footerY + 5, { align: "right" });
  doc.text("Page 1 of 1", pageWidth - margin, footerY + 9, { align: "right" });

  const safeFileName = `${(studentName || "Student").replace(/[^a-zA-Z0-9]/g, "_")}_${(testTitle || "SAT_Mock").replace(/[^a-zA-Z0-9]/g, "_")}_Score_Report.pdf`;
  doc.save(safeFileName);
};

function ResultsTrophyIllustration() {
  return (
    <div className="sat-results-trophy-illustration" aria-hidden="true">
      <svg width="220" height="150" viewBox="0 0 220 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Soft Radial Glow */}
        <ellipse cx="145" cy="75" rx="65" ry="55" fill="#E0F2FE" fillOpacity="0.8" />

        {/* Floating Sparkles */}
        <path d="M42 28L43.5 20L45 28L53 29.5L45 31L43.5 39L42 31L34 29.5Z" fill="#38BDF8" fillOpacity="0.85" />
        <path d="M198 26L199.5 20L201 26L207 27.5L201 29L199.5 35L198 29L192 27.5Z" fill="#38BDF8" fillOpacity="0.85" />
        <path d="M64 112L65.5 107L67 112L72 113.5L67 115L65.5 120L64 115L59 113.5Z" fill="#38BDF8" fillOpacity="0.65" />
        <path d="M204 88L205 84L206 88L210 89L206 90L205 94L204 90L200 89Z" fill="#60A5FA" fillOpacity="0.75" />

        {/* Tilted White SAT Sheet */}
        <g transform="translate(68, 14) rotate(-8)">
          <rect x="0" y="0" width="76" height="104" rx="8" fill="#FFFFFF" filter="drop-shadow(0 8px 18px rgba(15, 23, 42, 0.12))" />
          <text x="38" y="26" textAnchor="middle" fill="#1D4ED8" fontSize="17" fontWeight="900" fontFamily="system-ui, -apple-system, sans-serif">SAT</text>
          
          {/* Bar Chart Graphics on Paper */}
          <rect x="18" y="62" width="9" height="24" rx="2" fill="#93C5FD" />
          <rect x="34" y="46" width="9" height="40" rx="2" fill="#60A5FA" />
          <rect x="50" y="32" width="9" height="54" rx="2" fill="#2563EB" />
        </g>

        {/* 3D Glossy Blue Trophy */}
        <g transform="translate(118, 28)">
          {/* Trophy Handles */}
          <path d="M6 24C-4 24 -6 38 4 48C10 54 18 52 18 52" stroke="#1D4ED8" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <path d="M50 24C60 24 62 38 52 48C46 54 38 52 38 52" stroke="#1D4ED8" strokeWidth="4.5" strokeLinecap="round" fill="none" />

          {/* Trophy Cup Body */}
          <path d="M10 14H46C46 14 48 48 28 58C8 48 10 14 10 14Z" fill="url(#satTrophyGrad)" filter="drop-shadow(0 8px 18px rgba(29, 78, 216, 0.35))" />
          <ellipse cx="28" cy="14" rx="18" ry="4.5" fill="#60A5FA" />
          <ellipse cx="28" cy="14" rx="16" ry="3.5" fill="#3B82F6" />

          {/* White Star on Cup */}
          <path d="M28 28L30 34H36.5L31.2 37.8L33.2 44L28 40.2L22.8 44L24.8 37.8L19.5 34H26Z" fill="#FFFFFF" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.2))" />

          {/* Stem & Tiered Pedestal */}
          <path d="M24 58H32V72H24Z" fill="#1E40AF" />
          <rect x="18" y="72" width="20" height="7" rx="2" fill="#1D4ED8" />
          <rect x="12" y="79" width="32" height="7" rx="3" fill="#1E3A8A" />
        </g>

        <defs>
          <linearGradient id="satTrophyGrad" x1="10" y1="14" x2="46" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A5FA" />
            <stop offset="0.3" stopColor="#3B82F6" />
            <stop offset="0.7" stopColor="#2563EB" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function Results() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const subscription = useSatSubscription();

  // Student details from storage
  const student = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "null");
    } catch (_) {
      return null;
    }
  })();

  const formatName = (name) => {
    if (!name || typeof name !== "string") return "Aravind Bonda";
    return name
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  useEffect(() => {
    let localResult = null;
    const pad = String(attemptId || "").replace(/\D/g, "").padStart(2, "0");
    try {
      localResult = JSON.parse(
        sessionStorage.getItem(`edutechex-sat-attempt-${attemptId}`) ||
        localStorage.getItem(`edutechex-sat-attempt-${attemptId}`) ||
        sessionStorage.getItem(`edutechex-sat-attempt-${pad}`) ||
        localStorage.getItem(`edutechex-sat-attempt-${pad}`) ||
        sessionStorage.getItem(RESULT_KEY) ||
        localStorage.getItem(RESULT_KEY) ||
        "null"
      );
    } catch (_) {}

    if (localResult) {
      const matchFound =
        localResult._id === attemptId ||
        localResult.attemptId === attemptId ||
        localResult.testId === attemptId ||
        String(localResult.testId).padStart(2, "0") === pad ||
        !attemptId;
      if (matchFound) {
        setResult(localResult);
        setLoading(false);
      }
    }

    fetch(`${SAT_API_URL}/sat/mocks/result/${attemptId}`, { headers: satAuthHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.result) {
          setResult(data.result);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch result from server, using cached result:", err);
      })
      .finally(() => setLoading(false));
  }, [attemptId]);

  const handleLogout = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(RESULT_KEY);
      localStorage.removeItem(RESULT_KEY);
    } catch (_) {}
    navigate("/sat/login", { replace: true });
  };

  const matchedTest = tests.find((t) => t.id === attemptId || t.id === String(attemptId).replace(/\D/g, "").padStart(2, "0"));
  const defaultTitle = matchedTest ? matchedTest.title : (attemptId ? `Full SAT Mock ${attemptId}` : "Full SAT Mock 01");
  const defaultTestId = matchedTest ? matchedTest.id : (attemptId ? String(attemptId).replace(/\D/g, "").padStart(2, "0") : "01");

  const finalResult = result || {
    testTitle: defaultTitle,
    testId: defaultTestId,
    studentName: student?.name || "Student",
    studentEmail: student?.email || "",
    scaleScore: 1200,
    rawScore: 70,
    totalQuestions: 98,
    readingWritingScore: 600,
    mathScore: 600,
    completedAt: new Date().toISOString(),
    modules: [
      { moduleNumber: 1, moduleName: "Reading & Writing - Module 1", score: 20, totalQuestions: 27, wrong: 7, blank: 0, completed: true },
      { moduleNumber: 2, moduleName: "Reading & Writing - Module 2", score: 18, totalQuestions: 27, wrong: 9, blank: 0, completed: true },
      { moduleNumber: 3, moduleName: "Math - Module 1", score: 16, totalQuestions: 22, wrong: 6, blank: 0, completed: true },
      { moduleNumber: 4, moduleName: "Math - Module 2", score: 16, totalQuestions: 22, wrong: 6, blank: 0, completed: true },
    ],
  };

  const studentName = formatName(student?.name || finalResult.studentName || "Student");
  const studentEmail = student?.email || finalResult.studentEmail || "";
  const counselingTestId = String(finalResult.testId || defaultTestId).replace(/\D/g, "").padStart(2, "0");
  const counselingMockNumber = Number.parseInt(counselingTestId, 10) || 1;
  const counselingIsFree = counselingMockNumber <= 3;
  const hasPaidMockAccessForResult = subscription.hasPurchase || subscription.active || subscription.unlockedTestIds.includes(counselingTestId);

  const initials = (() => {
    const parts = studentName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (studentName[0] || "A").toUpperCase();
  })();

  const modules = finalResult.modules && finalResult.modules.length === 4
    ? finalResult.modules
    : [
        { moduleNumber: 1, moduleName: "Reading & Writing - Module 1", score: 8, totalQuestions: 27, wrong: 19, blank: 0, completed: true },
        { moduleNumber: 2, moduleName: "Reading & Writing - Module 2", score: 1, totalQuestions: 27, wrong: 17, blank: 9, completed: true },
        { moduleNumber: 3, moduleName: "Math - Module 1", score: 0, totalQuestions: 22, wrong: 0, blank: 22, completed: true },
        { moduleNumber: 4, moduleName: "Math - Module 2", score: 0, totalQuestions: 22, wrong: 0, blank: 22, completed: true },
      ];

  const rwCorrect = (modules[0]?.score || 0) + (modules[1]?.score || 0);
  const mathCorrect = (modules[2]?.score || 0) + (modules[3]?.score || 0);
  const rwTotal = (modules[0]?.totalQuestions || 27) + (modules[1]?.totalQuestions || 27);
  const mathTotal = (modules[2]?.totalQuestions || 22) + (modules[3]?.totalQuestions || 22);
  const totalQuestions = Number(finalResult.totalQuestions) || (rwTotal + mathTotal) || 98;
  const totalRaw = finalResult.rawScore !== undefined ? Number(finalResult.rawScore) : (rwCorrect + mathCorrect);
  const totalIncorrect = modules.reduce((sum, m) => {
    const tq = m.totalQuestions || (m.moduleNumber <= 2 ? 27 : 22);
    const inc = m.wrong !== undefined ? Number(m.wrong) : Math.max(0, tq - (Number(m.score) || 0) - (Number(m.blank) || 0));
    return sum + inc;
  }, 0);
  const totalBlank = modules.reduce((sum, m) => sum + (m.blank !== undefined ? Number(m.blank) : 0), 0);
  const totalAttempted = totalRaw + totalIncorrect;

  const formattedDate = (() => {
    try {
      const d = finalResult.completedAt ? new Date(finalResult.completedAt) : new Date();
      return (
        d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }) +
        ", " +
        d.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    } catch (_) {
      return "Tue, 3 Nov 2026, 16:54";
    }
  })();

  if (loading) {
    return (
      <div className="sat-dash-root">
        <div className="sat-dash-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
          <div className="sat-results-loading">
            <div className="sat-spinner" />
            <p style={{ marginTop: "16px", color: "#64748b", fontWeight: 600 }}>Loading official score report…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sat-dash-root">
      {/* Mobile Backdrop */}
      <div
        className={`sat-dash-backdrop ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ==================== FIXED SIDEBAR (MOCKUP MATCH) ==================== */}
      <aside className={`sat-dash-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        {/* Mobile Close Button */}
        <button
          type="button"
          className="sat-sidebar-close-btn"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Brand Lockup: EduTechEX Logo with Cap & Portal Tag */}
        <div className="sat-sidebar-brand">
          <Link to="/" className="sat-sidebar-brand-link" aria-label="EduTechEX Home">
            <img src={edutechLogo} alt="EduTechEX" className="sat-sidebar-logo" />
          </Link>
          <div className="sat-sidebar-portal-tag">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <rect x="2" y="11" width="3.5" height="7" rx="1.5" />
              <rect x="8.2" y="6" width="3.5" height="12" rx="1.5" />
              <rect x="14.5" y="2" width="3.5" height="16" rx="1.5" />
            </svg>
            <span>SAT STUDENT PORTAL</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sat-sidebar-nav">
          <span className="sat-nav-section-title">NAVIGATION</span>
          <Link to="/sat/dashboard?tab=overview" className="sat-sidebar-item">
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">Dashboard</span>
          </Link>

          <Link to="/sat/dashboard?tab=papers" className="sat-sidebar-item">
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">SAT Mock Papers</span>
            <span className="sat-sidebar-item-badge">{tests.length}</span>
          </Link>

          <Link to="/sat/dashboard?tab=results" className="sat-sidebar-item is-active">
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">My Performance</span>
            <span className="sat-sidebar-item-badge">2</span>
          </Link>

          <Link to="/sat/dashboard?tab=subscription" className="sat-sidebar-item">
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">Subscription</span>
            {subscription.active ? (
              <span className="sat-sidebar-item-badge is-amber-badge">Active</span>
            ) : (
              <span className="sat-sidebar-item-badge" style={{ background: "#f1f5f9", color: "#64748b" }}>Free</span>
            )}
          </Link>

          <Link to={`/sat/counseling?mockTestId=${counselingTestId}`} className="sat-sidebar-item">
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">Counseling</span>
          </Link>

          <span className="sat-nav-section-title" style={{ marginTop: "14px" }}>GUIDELINES</span>
          <Link to="/sat/dashboard?tab=instructions" className="sat-sidebar-item">
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">Exam Guide & Rules</span>
          </Link>
        </nav>

        {/* Sidebar Footer User Card */}
        <div className="sat-sidebar-footer">
          <div className="sat-sidebar-user-card">
            <div className="sat-sidebar-avatar">{initials}</div>
            <div className="sat-sidebar-user-info">
              <span className="sat-sidebar-user-name" title={studentName}>{studentName}</span>
              <span className="sat-sidebar-user-role">SAT Student</span>
            </div>
          </div>
          <button
            type="button"
            className="sat-sidebar-logout-btn"
            onClick={handleLogout}
            id="sat-sidebar-logout-btn"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* ==================== MAIN COLUMN ==================== */}
      <div className="sat-dash-main">
        {/* ==================== HEADER (MOCKUP MATCH) ==================== */}
        <header className="sat-dash-header sat-results-header">
          <div className="sat-header-left">
            <button
              type="button"
              className="sat-menu-toggle"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="sat-header-title-box">
              <h1 className="sat-header-greeting">Welcome back, {studentName}! 👋</h1>
              <span className="sat-header-sub">Track your progress and improve your SAT performance</span>
            </div>
          </div>
          <div className="sat-header-right">
            <Link to="/sat/dashboard" className="sat-back-dash-btn" id="sat-back-from-results-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span className="sat-back-dash-full">Back to Dashboard</span>
              <span className="sat-back-dash-short">Dashboard</span>
            </Link>
          </div>
        </header>

        {/* ==================== REPORT CONTENT ==================== */}
        <main className="sat-dash-content sat-results-content">
          {/* ==================== 1. HERO SCORE REPORT CARD ==================== */}
          <section className="sat-results-hero-card">
            {/* Top row */}
            <div className="sat-results-hero-top">
              <div className="sat-results-green-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="sat-badge-full">Test Completed Successfully</span>
                <span className="sat-badge-short">Completed</span>
              </div>
              <div className="sat-results-date-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{formattedDate}</span>
              </div>
            </div>

            {/* Title & 3D Trophy Graphic */}
            <div className="sat-results-hero-body">
              <div className="sat-results-hero-text">
                <h2 className="sat-results-title">{finalResult.testTitle || `Full SAT Mock ${finalResult.testId || "17"}`} – Score Report</h2>
                <p className="sat-results-subtitle">
                  Student: <strong>{finalResult.studentName || studentName}</strong> ({finalResult.studentEmail || studentEmail})
                </p>
              </div>

              {/* 3D SAT Trophy Illustration matching second image */}
              <ResultsTrophyIllustration />
            </div>

            {/* 3 Stat Cards in a row */}
            <div className="sat-results-overview-grid">
              {/* Card 1: TOTAL SCORE */}
              <div className="sat-score-card is-total">
                <div className="sat-score-card-header">
                  <div className="sat-score-card-icon is-green">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.45 1-1 1H8v2h8v-2h-1c-.55 0-1-.45-1-1v-2.34" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                    </svg>
                  </div>
                  <span className="sat-score-card-label">SAT PRACTICE SCALE SCORE</span>
                </div>
                <div className="sat-score-card-value-wrap">
                  <strong className="sat-score-card-number is-green-num">{finalResult.scaleScore || 500}</strong>
                  <span className="sat-score-card-denom">/ 1600</span>
                </div>
                <div className="sat-score-card-footer is-green-meta">
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                    <rect x="2" y="10" width="3.5" height="8" rx="1" />
                    <rect x="8.2" y="5" width="3.5" height="13" rx="1" />
                    <rect x="14.5" y="1" width="3.5" height="17" rx="1" />
                  </svg>
                  <span>Raw Score: {totalRaw} / {totalQuestions} correct ({Math.round((totalRaw / totalQuestions) * 100)}%)</span>
                </div>
              </div>

              {/* Card 2: READING & WRITING */}
              <div className="sat-score-card is-rw">
                <div className="sat-score-card-header">
                  <div className="sat-score-card-icon is-blue">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  </div>
                  <span className="sat-score-card-label">READING & WRITING</span>
                </div>
                <div className="sat-score-card-value-wrap">
                  <strong className="sat-score-card-number">{finalResult.readingWritingScore || 300}</strong>
                  <span className="sat-score-card-denom">/ 800</span>
                </div>
                <div className="sat-score-card-footer is-green-meta">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Raw: {rwCorrect} / {rwTotal} correct ({Math.round((rwCorrect / rwTotal) * 100)}%)</span>
                </div>
              </div>

              {/* Card 3: MATHEMATICS */}
              <div className="sat-score-card is-math">
                <div className="sat-score-card-header">
                  <div className="sat-score-card-icon is-purple">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="2" width="16" height="20" rx="2" />
                      <line x1="8" y1="6" x2="16" y2="6" />
                      <line x1="16" y1="14" x2="16" y2="18" />
                      <path d="M16 10h.01" />
                      <path d="M12 10h.01" />
                      <path d="M8 10h.01" />
                      <path d="M12 14h.01" />
                      <path d="M8 14h.01" />
                      <path d="M12 18h.01" />
                      <path d="M8 18h.01" />
                    </svg>
                  </div>
                  <span className="sat-score-card-label">MATHEMATICS</span>
                </div>
                <div className="sat-score-card-value-wrap">
                  <strong className="sat-score-card-number">{finalResult.mathScore || 200}</strong>
                  <span className="sat-score-card-denom">/ 800</span>
                </div>
                <div className="sat-score-card-footer is-purple-meta">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Raw: {mathCorrect} / {mathTotal} correct ({Math.round((mathCorrect / mathTotal) * 100)}%)</span>
                </div>
              </div>
            </div>

            {/* Raw Score Output Strip */}
            <div className="sat-raw-output-banner">
              <div className="sat-raw-output-main">
                <span className="sat-raw-badge">ANSWER BREAKDOWN</span>
                <div className="sat-raw-main-count">
                  <strong className="sat-raw-num-highlight">{totalRaw}</strong>
                  <span className="sat-raw-denom-highlight">/ {totalQuestions} Correct</span>
                  <span className="sat-raw-pct-highlight">({Math.round((totalRaw / totalQuestions) * 100)}%)</span>
                </div>
              </div>
              <div className="sat-raw-stats-row">
                <div className="sat-raw-stat-pill is-correct">
                  <span className="sat-raw-dot is-green" />
                  <span className="sat-raw-stat-lbl">Correct:</span>
                  <strong className="sat-raw-stat-val">{totalRaw}</strong>
                </div>
                <div className="sat-raw-stat-pill is-incorrect">
                  <span className="sat-raw-dot is-rose" />
                  <span className="sat-raw-stat-lbl">Incorrect:</span>
                  <strong className="sat-raw-stat-val">{totalIncorrect}</strong>
                </div>
                <div className="sat-raw-stat-pill is-blank">
                  <span className="sat-raw-dot is-gray" />
                  <span className="sat-raw-stat-lbl">Unanswered:</span>
                  <strong className="sat-raw-stat-val">{totalBlank}</strong>
                </div>
                <div className="sat-raw-stat-pill is-accuracy">
                  <span className="sat-raw-dot is-blue" />
                  <span className="sat-raw-stat-lbl">Accuracy:</span>
                  <strong className="sat-raw-stat-val">{totalAttempted > 0 ? Math.round((totalRaw / totalAttempted) * 100) : 0}%</strong>
                </div>
              </div>
            </div>
          </section>

          

          {/* ==================== 2. MODULE-BY-MODULE SCORES (PAID MOCK ACCESS) ==================== */}
          {hasPaidMockAccessForResult ? (
            <section className="sat-modules-section">
              <div className="sat-modules-section-header">
                <div className="sat-modules-header-left">
                  <div className="sat-modules-icon-badge">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                      <rect x="2" y="11" width="3.5" height="7" rx="1.5" />
                      <rect x="8.2" y="6" width="3.5" height="12" rx="1.5" />
                      <rect x="14.5" y="2" width="3.5" height="16" rx="1.5" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="sat-modules-title">Module-by-Module Scores</h3>
                    <p className="sat-modules-subtitle">
                      Detailed performance evaluation and completion status for every module in this paper.
                    </p>
                  </div>
                </div>
                <div className="sat-all-complete-indicator">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>4 / 4 Modules Completed</span>
                </div>
              </div>

              <div className="sat-modules-grid">
                {modules.map((mod) => {
                  const totalQ = mod.totalQuestions || (mod.moduleNumber <= 2 ? 27 : 22);
                  const accuracy = Math.round(((mod.score || 0) / totalQ) * 100);
                  const incorrect = mod.wrong !== undefined ? mod.wrong : Math.max(0, totalQ - (mod.score || 0) - (mod.blank || 0));
                  const blank = mod.blank !== undefined ? mod.blank : 0;

                  return (
                    <div className="sat-module-card is-complete" key={mod.moduleNumber}>
                      <div className="sat-module-card-header">
                        <div className="sat-module-title-wrap">
                          <span className="sat-module-num-circle">{mod.moduleNumber}</span>
                          <div>
                            <h4 className="sat-module-name">{mod.moduleName}</h4>
                            <span className="sat-module-meta">{totalQ} questions</span>
                          </div>
                        </div>
                        <span className="sat-module-green-pill">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Completed</span>
                        </span>
                      </div>

                      <div className="sat-module-score-display">
                        <div className="sat-module-score-numbers">
                          <strong className="sat-module-score-big">{mod.score || 0}</strong>
                          <span className="sat-module-score-slash">/ {totalQ}</span>
                        </div>
                        <span className="sat-module-accuracy-tag">{accuracy}% accuracy</span>
                      </div>

                      {/* Accuracy Bar */}
                      <div className="sat-module-progress-track">
                        <div className="sat-module-progress-fill" style={{ width: `${Math.max(accuracy, 2)}%` }} />
                      </div>

                      <div className="sat-module-stats-mini-row">
                        <div className="sat-mod-mini-stat">
                          <span className="sat-mod-mini-dot is-green" />
                          <span>{mod.score || 0} Correct</span>
                        </div>
                        <div className="sat-mod-mini-stat">
                          <span className="sat-mod-mini-dot is-rose" />
                          <span>{incorrect} Incorrect</span>
                        </div>
                        <div className="sat-mod-mini-stat">
                          <span className="sat-mod-mini-dot is-gray" />
                          <span>{blank} Blank</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="sat-modules-locked-banner">
              <div className="sat-modules-locked-card">
                <div className="sat-modules-locked-icon" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className="sat-modules-locked-info">
                  <span className="sat-modules-locked-badge">🔒 Premium Feature</span>
                  <h3 className="sat-modules-locked-title">Unlock Module-by-Module Scores & Analytics</h3>
                  <p className="sat-modules-locked-desc">
                    Each ₹999 pack unlocks three paid mock papers with detailed module-by-module results and analytics.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSubscriptionModal(true)}
                  className="sat-btn-start-test sat-modules-unlock-btn"
                  id="sat-unlock-modules-btn"
                  style={{ cursor: "pointer", border: "none" }}
                >
                  <span>Buy a 10-Paper Pack (₹999)</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </section>
          )}

          <section
            className="sat-modules-locked-banner"
            style={{ marginTop: 24, marginBottom: 24 }}
            aria-labelledby="sat-results-counseling-title"
          >
            <div className="sat-modules-locked-card" style={{ alignItems: "center" }}>
              <div className="sat-modules-locked-icon" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="sat-modules-locked-info">
                <span className="sat-modules-locked-badge">PERSONALIZED GUIDANCE</span>
                <h3 className="sat-modules-locked-title" id="sat-results-counseling-title">Discuss your score with an SAT counselor</h3>
                <p className="sat-modules-locked-desc">
                  Get a personal review of your {finalResult.testTitle || `Full SAT Mock ${counselingTestId}`} results and practical next steps.
                  {counselingIsFree ? " Your first three mock tests include a free 30-minute session." : " Counseling for this mock is ₹999."}
                </p>
              </div>
              <Link
                to={`/sat/counseling?mockTestId=${counselingTestId}`}
                className="sat-btn-start-test"
                style={{ textDecoration: "none", whiteSpace: "nowrap" }}
              >
                {counselingIsFree ? "Book Free Counseling" : "Book Counseling · ₹999"}
              </Link>
            </div>
          </section>

          {/* Footer actions */}
          <div className="sat-results-footer-actions">
            <Link to="/sat/dashboard" className="sat-results-portal-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span>Back to Dashboard</span>
            </Link>
            <div className="sat-results-action-group">
              <button
                type="button"
                className="sat-results-pdf-btn"
                onClick={() => {
                  setDownloadingPdf(true);
                  try {
                    generateScoreReportPdf(finalResult, modules, rwCorrect, mathCorrect, hasPaidMockAccessForResult);
                  } catch (err) {
                    console.error("PDF generation error:", err);
                    alert("Could not generate PDF. Please try printing using the Print Results button.");
                  } finally {
                    setDownloadingPdf(false);
                  }
                }}
                disabled={downloadingPdf}
                id="sat-download-pdf-btn"
                title="Download score report as a PDF"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{downloadingPdf ? "Generating PDF…" : "Download PDF"}</span>
              </button>
              <button
                type="button"
                className="sat-results-print-btn"
                onClick={() => window.print()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print Results</span>
              </button>
              <Link
                to={`/sat/mock-tests/${finalResult.testId || "17"}/instructions`}
                className="sat-results-retake-btn"
              >
                <span>Retake Test</span>
              </Link>
            </div>
          </div>
        </main>
      </div>

      {/* Subscription Popup Modal */}
      {showSubscriptionModal && (
        <SatSubscription
          isModal={true}
          onClose={() => setShowSubscriptionModal(false)}
          onSubscribed={() => {
            setShowSubscriptionModal(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function SatNotFound() {
  return <SatShell><section className="sat-card sat-small-card"><h1>Mock test not found</h1><p>This SAT practice route does not match one of the available mock tests.</p><Link className="sat-primary-button sat-button-link" to="/sat/mock-tests">Browse mock tests <span>→</span></Link></section></SatShell>;
}

export { Registration, Login, VerifyOtp, MockTests, SatDashboard, TestInstructions, MockTest, Results, SatNotFound };

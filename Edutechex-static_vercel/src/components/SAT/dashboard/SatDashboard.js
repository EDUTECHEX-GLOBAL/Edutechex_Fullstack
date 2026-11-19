import React, { useEffect, useState, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import edutechLogo from "../../../assets/Edutech-logo.svg";
import SatSubscription from "../../SAT-subscription/pay";
import "./satDashboard.css";

// ── Counseling helpers ──────────────────────────────────────────────────────
const COUNSELING_FREE_LIMIT = 3;
const COUNSELING_PAID_AMOUNT = 999;
function isCounselingFree(mockNum) { return mockNum <= COUNSELING_FREE_LIMIT; }

function formatCounselingDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00+05:30");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function formatCounselingTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
// ───────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "edutechex-sat-registration";
const RESULT_KEY = "edutechex-sat-last-result";
const SAT_API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const moduleMinutes = [32, 32, 35, 35];
const testDurationMinutes = moduleMinutes.reduce((total, minutes) => total + minutes, 0);
const sectionBreakMinutes = 10;

// All 150 SAT mock papers present in public/sat-mocks.
const availableTestNumbers = Array.from({ length: 150 }, (_, index) => index + 1);

const satTests = availableTestNumbers.map((number) => {
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

function getNextTestPack(unlockedTestIds = []) {
  const unlocked = new Set(unlockedTestIds);
  return MOCK_PACKS.find((pack) => pack.some((testId) => !unlocked.has(testId))) || MOCK_PACKS[0];
}

function canAccessTest(test, subscription) {
  return isFreeTest(test) || subscription.active || subscription.unlockedTestIds.includes(test.id);
}

function getStoredStudent() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function satAuthHeaders() {
  const student = getStoredStudent();
  return student?.token ? { Authorization: `Bearer ${student.token}` } : {};
}

function formatName(name) {
  if (!name || typeof name !== "string") return "Aravind Bonda";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function SatDashboard({ initialTab = "overview" }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || initialTab;

  const [activeTab, setActiveTab] = useState(tabFromUrl || "overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [selectedPackTestIds, setSelectedPackTestIds] = useState(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem("edutechex-sat-subscription-active") || localStorage.getItem("edutechex-sat-subscription-active") || "null");
      return getNextTestPack(cached?.unlockedTestIds || []);
    } catch (_) {
      return ["04", "05", "06"];
    }
  });
  const [completedMap, setCompletedMap] = useState({});
  const [completedList, setCompletedList] = useState([]);
  const [filterType, setFilterType] = useState("all"); // 'all' | 'available' | 'completed'
  const [searchQuery, setSearchQuery] = useState("");
  const [student, setStudent] = useState(() => getStoredStudent());
  const [counselingBookings, setCounselingBookings] = useState([]);

  useEffect(() => {
    if (activeTab !== "counseling" || !student?.token) return;
    let cancelled = false;
    fetch(`${SAT_API_URL.replace(/\/$/, "")}/counseling/my-bookings`, { headers: satAuthHeaders() })
      .then((response) => response.json())
      .then((data) => { if (!cancelled && data.success) setCounselingBookings(data.bookings || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab, student?.token]);

  const ITEMS_PER_PAGE = 5;
  const [currentPage, setCurrentPage] = useState(1);

  const [subscription, setSubscription] = useState(() => {
    try {
      const currentStudent = getStoredStudent();
      const cached = JSON.parse(
        sessionStorage.getItem("edutechex-sat-subscription-active") ||
        localStorage.getItem("edutechex-sat-subscription-active") ||
        "null"
      );
      if (cached && cached.email && currentStudent?.email && cached.email.toLowerCase() !== currentStudent.email.toLowerCase()) {
        return { loading: true, active: false, unlockedTestIds: [], expiresAt: null, error: "" };
      }
      if (cached && cached.active) {
        return { loading: false, active: true, unlockedTestIds: cached.unlockedTestIds || [], expiresAt: cached.expiresAt || null, error: "" };
      }
      if (cached && Array.isArray(cached.unlockedTestIds)) {
        return { loading: false, active: false, unlockedTestIds: cached.unlockedTestIds, expiresAt: cached.expiresAt || null, error: "" };
      }
    } catch (_) {}
    return { loading: true, active: false, unlockedTestIds: [], expiresAt: null, error: "" };
  });

  const dropdownRef = useRef(null);

  // Sync tab with URL
  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (currentTab && currentTab !== activeTab) {
      setActiveTab(currentTab);
    }
  }, [searchParams, activeTab]);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, searchQuery]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setSidebarOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check login status & load subscription
  useEffect(() => {
    const currentStudent = getStoredStudent();
    setStudent(currentStudent);

    if (!currentStudent?.email || !currentStudent?.token) {
      navigate("/sat/login", { replace: true });
      return;
    }

    const email = currentStudent.email.trim().toLowerCase();

    // Fetch subscription
    let active = true;
    const checkSubscription = () => {
      fetch(`${SAT_API_URL}/pay/subscription`, { headers: satAuthHeaders() })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not check your subscription.");
          if (active) {
            const isActive = Boolean(data.fullAccess ?? data.active);
            const unlockedTestIds = Array.isArray(data.unlockedTestIds) ? data.unlockedTestIds : [];
            const subObj = { email, active: isActive, unlockedTestIds, expiresAt: data.expiresAt || null };
            sessionStorage.setItem("edutechex-sat-subscription-active", JSON.stringify(subObj));
            localStorage.setItem("edutechex-sat-subscription-active", JSON.stringify(subObj));
            setSubscription({ loading: false, active: isActive, unlockedTestIds, expiresAt: data.expiresAt || null, error: "" });
            setSelectedPackTestIds((currentPack) => (
              currentPack.every((testId) => unlockedTestIds.includes(testId))
                ? getNextTestPack(unlockedTestIds)
                : currentPack
            ));
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
                  setSubscription({ loading: false, active: true, unlockedTestIds: cached.unlockedTestIds || [], expiresAt: cached.expiresAt || null, error: "" });
                  return;
                }
                if (Array.isArray(cached.unlockedTestIds)) {
                  setSubscription({ loading: false, active: false, unlockedTestIds: cached.unlockedTestIds, expiresAt: cached.expiresAt || null, error: "" });
                  return;
                }
              }
            } catch (_) {}
            setSubscription({ loading: false, active: false, unlockedTestIds: [], expiresAt: null, error: error.message || "Could not verify subscription." });
          }
        });
    };

    checkSubscription();

    // Fetch student's completed mocks
    fetch(`${SAT_API_URL}/sat/mocks/student/${encodeURIComponent(email)}`, { headers: satAuthHeaders() })
      .then((res) => res.json())
      .then((data) => {
        const map = {};
        const list = [];
        if (data.success && Array.isArray(data.results)) {
          data.results.forEach((item) => {
            const tid = String(item.testId).padStart(2, "0");
            if (!map[tid]) {
              map[tid] = item;
              list.push(item);
            }
          });
        }

        // Also check cached result
        try {
          const cached = JSON.parse(sessionStorage.getItem(RESULT_KEY) || "null");
          if (cached?.testId && cached.studentEmail?.toLowerCase() === email) {
            const tid = String(cached.testId).padStart(2, "0");
            if (!map[tid]) {
              map[tid] = cached;
              list.unshift(cached);
            }
          }
        } catch (_) {}

        setCompletedMap(map);
        setCompletedList(list);
      })
      .catch((err) => {
        console.warn("Could not load mock results:", err);
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(RESULT_KEY);
    localStorage.removeItem(STORAGE_KEY);
    satTests.forEach((t) => sessionStorage.removeItem(`edutechex-sat-attempt-${t.id}`));
    setUserDropdownOpen(false);
    navigate("/sat/login", { replace: true });
  };

  // Student Details
  const studentName = formatName(student?.name || "Aravind Bonda");
  const studentEmail = student?.email?.trim() || "aravindbonda922@gmail.com";
  const studentPhone = student?.phone?.trim() || "Not specified";
  const studentCurriculum = student?.curriculum?.trim() || "ICSE";
  const studentGender = student?.gender?.trim() || "Student";

  // Initials for avatar
  const initials = useMemo(() => {
    const parts = studentName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (studentName[0] || "A").toUpperCase();
  }, [studentName]);

  // Completed count and best score
  const completedCount = Object.keys(completedMap).length > 0
    ? Object.keys(completedMap).length
    : completedList.length;
  const unlockedPaidCount = subscription.active ? (satTests.length - 3) : subscription.unlockedTestIds.length;
  const unlockedPaperCount = subscription.active ? satTests.length : 3 + unlockedPaidCount;

  const bestScore = useMemo(() => {
    let max = 0;
    Object.values(completedMap).forEach((res) => {
      const score = Number(res.scaleScore || 0);
      if (score > max) max = score;
    });
    if (max > 0) return max;
    completedList.forEach((res) => {
      const score = Number(res.scaleScore || 0);
      if (score > max) max = score;
    });
    return max > 0 ? max : 500;
  }, [completedMap, completedList]);

  // Filtered mock tests
  const filteredTests = useMemo(() => {
    return satTests.filter((test) => {
      const canAccess = canAccessTest(test, subscription);
      const isCompleted = Boolean(completedMap[test.id]);

      if (filterType === "available" && !canAccess) return false;
      if (filterType === "completed" && !isCompleted) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = test.title.toLowerCase().includes(query);
        const matchesId = test.id.includes(query);
        if (!matchesTitle && !matchesId) return false;
      }

      return true;
    });
  }, [subscription.active, subscription.unlockedTestIds, completedMap, filterType, searchQuery]);

// 5 items per page pagination (show all pages)
  const totalPages = Math.max(1, Math.ceil(filteredTests.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTests = useMemo(() => {
    return filteredTests.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTests, startIndex]);

  const goToPage = (page) => {
    const target = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(target);
    const mainEl = document.querySelector(".sat-dash-main");
    if (mainEl) {
      const el = document.getElementById("sat-papers-catalog");
      if (el) {
        mainEl.scrollTo({ top: el.offsetTop - 85, behavior: "smooth" });
      }
    }
  };

  return (
    <div className="sat-dash-root">
      {/* Mobile Backdrop */}
      <div
        className={`sat-dash-backdrop ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ==================== SIDEBAR ==================== */}
      <aside className={`sat-dash-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        {/* Close Button on Mobile */}
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

        {/* Brand - Official EduTechEX Logo */}
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

        {/* Navigation Links */}
        <nav className="sat-sidebar-nav">
          <span className="sat-nav-section-title">NAVIGATION</span>

          {/* Overview */}
          <button
            type="button"
            className={`sat-sidebar-item ${activeTab === "overview" ? "is-active" : ""}`}
            onClick={() => handleTabChange("overview")}
          >
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">Dashboard</span>
          </button>

          {/* SAT Mock Papers */}
          <button
            type="button"
            className={`sat-sidebar-item ${activeTab === "papers" ? "is-active" : ""}`}
            onClick={() => handleTabChange("papers")}
          >
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">SAT Mock Papers</span>
            <span className="sat-sidebar-item-badge">{satTests.length}</span>
          </button>

          {/* My Performance */}
          <button
            type="button"
            className={`sat-sidebar-item ${activeTab === "results" ? "is-active" : ""}`}
            onClick={() => handleTabChange("results")}
          >
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">My Performance</span>
            <span className="sat-sidebar-item-badge">{completedCount}</span>
          </button>

          {/* Subscription */}
          <button
            type="button"
            className={`sat-sidebar-item ${activeTab === "subscription" ? "is-active" : ""}`}
            onClick={() => handleTabChange("subscription")}
          >
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">Subscription</span>
            {subscription.active ? (
              <span className="sat-sidebar-item-badge is-amber-badge">Active</span>
            ) : (
              <span className="sat-sidebar-item-badge" style={{ background: "#f1f5f9", color: "#64748b" }}>{unlockedPaidCount ? `${unlockedPaidCount} Papers` : "Free"}</span>
            )}
          </button>

          <span className="sat-nav-section-title" style={{ marginTop: "14px" }}>COUNSELING</span>

          {/* Counseling */}
          <button
            type="button"
            className={`sat-sidebar-item ${activeTab === "counseling" ? "is-active" : ""}`}
            onClick={() => handleTabChange("counseling")}
          >
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">Counseling</span>
            {completedCount > 0 && (
              <span className="sat-sidebar-item-badge is-amber-badge">{completedCount > 3 ? "₹999" : "Free"}</span>
            )}
          </button>

          <span className="sat-nav-section-title" style={{ marginTop: "14px" }}>GUIDELINES</span>

          {/* Instructions & Guidelines */}
          <button
            type="button"
            className={`sat-sidebar-item ${activeTab === "instructions" ? "is-active" : ""}`}
            onClick={() => handleTabChange("instructions")}
          >
            <span className="sat-sidebar-item-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
            <span className="sat-sidebar-item-text">Exam Guide & Rules</span>
          </button>
        </nav>

        {/* Sidebar Footer: Student Profile Card & Logout */}
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
        {/* ==================== HEADER ==================== */}
        <header className="sat-dash-header">
          <div className="sat-header-left">
            {/* Mobile Sidebar Hamburger Toggle */}
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
              <span className="sat-header-sub">
                Dashboard Overview & Practice Papers
              </span>
            </div>
          </div>

          {/* User Details in Header */}
          <div className="sat-header-right">
            {/* Curriculum Pill */}
            <div className="sat-curriculum-badge" title="Student Curriculum">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
              <span>{studentCurriculum}</span>
            </div>

            {/* Subscription Tier Pill */}
            {subscription.active ? (
              <div className="sat-subscription-badge is-premium" title={`All ${satTests.length} mock tests unlocked`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>Premium Active</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSubscriptionModal(true)}
                className="sat-subscription-badge is-free-tier"
                title="Buy a 10-paper SAT pack for ₹999"
                style={{ cursor: "pointer", border: "none" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{unlockedPaidCount ? `${unlockedPaidCount} Premium Papers` : "Free Tier (Mocks 01–03)"}</span>
              </button>
            )}

            {/* User Profile Pill & Dropdown */}
            <div className={`sat-user-dropdown-wrap ${userDropdownOpen ? "is-open" : ""}`} ref={dropdownRef}>
              <button
                type="button"
                className="sat-user-pill-btn"
                onClick={() => setUserDropdownOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={userDropdownOpen}
                id="sat-header-user-btn"
              >
                <div className="sat-user-pill-avatar">{initials}</div>
                <span className="sat-user-pill-name">{studentName}</span>
                <svg
                  className="sat-user-chevron-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* User Dropdown Menu Card */}
              {userDropdownOpen && (
                <div className="sat-user-popover" role="menu">
                  {/* Popover Header with User Details */}
                  <div className="sat-popover-header">
                    <div className="sat-popover-avatar-lg">{initials}</div>
                    <div className="sat-popover-user-meta">
                      <h4 className="sat-popover-user-name">{studentName}</h4>
                      <p className="sat-popover-user-email">{studentEmail}</p>
                    </div>
                  </div>

                  {/* Student Attributes Details */}
                  <div className="sat-popover-details-list">
                    <div className="sat-popover-detail-row">
                      <span className="sat-popover-detail-label">Phone:</span>
                      <span className="sat-popover-detail-val">{studentPhone}</span>
                    </div>
                    <div className="sat-popover-detail-row">
                      <span className="sat-popover-detail-label">Curriculum:</span>
                      <span className="sat-popover-detail-val">{studentCurriculum}</span>
                    </div>
                    <div className="sat-popover-detail-row">
                      <span className="sat-popover-detail-label">Gender:</span>
                      <span className="sat-popover-detail-val">{studentGender}</span>
                    </div>
                    <div className="sat-popover-detail-row">
                      <span className="sat-popover-detail-label">Subscription:</span>
                      <span className="sat-popover-detail-val" style={{ color: subscription.active ? "#15803d" : unlockedPaidCount ? "#2563eb" : "#475569" }}>
                        {subscription.active
                          ? `Premium Plan (${satTests.length} Mocks)`
                          : unlockedPaidCount
                          ? `Pack Plan (${unlockedPaperCount} Mocks)`
                          : "Free Plan (3 Mocks)"}
                      </span>
                    </div>
                  </div>

                  {/* Quick Links inside Menu */}
                  <div className="sat-popover-actions">
                    <button
                      type="button"
                      className="sat-popover-link"
                      onClick={() => {
                        handleTabChange("papers");
                        setUserDropdownOpen(false);
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>SAT Mock Papers</span>
                    </button>

                    <button
                      type="button"
                      className="sat-popover-link"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        setShowSubscriptionModal(true);
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span>Manage Subscription</span>
                    </button>

                    <button
                      type="button"
                      className="sat-popover-logout-btn"
                      onClick={handleLogout}
                      id="sat-popover-logout-btn"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ==================== DASHBOARD CONTENT ==================== */}
        <main className="sat-dash-content">
          {/* TAB 1: OVERVIEW OR PAPERS */}
          {(activeTab === "overview" || activeTab === "papers") && (
            <>
              {/* Hero Banner (Shown in Overview tab) */}
              {activeTab === "overview" && (
                <section className="sat-welcome-banner">
                  <div className="sat-welcome-info">
                    <div className="sat-welcome-badge">
                      <span>Digital SAT 2026 Ready</span>
                    </div>
                    <h2 className="sat-welcome-title">Master the SAT with Full-Length Mock Exams</h2>
                    <p className="sat-welcome-subtitle">
                      Simulate actual test-day conditions with all {satTests.length} practice papers. Features adaptive module timing, built-in graphing calculator support, and instant detailed score breakdown.
                    </p>
                    <div className="sat-welcome-actions">
                      <a href="#sat-papers-catalog" className="sat-welcome-cta-btn">
                        <span>Start Practice Mock</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </a>
                      <button
                        type="button"
                        className="sat-welcome-sec-btn"
                        onClick={() => handleTabChange("instructions")}
                      >
                        <span>Exam Instructions</span>
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* Stats Row (Shown in Overview tab) */}
              {activeTab === "overview" && (
                <section className="sat-stats-grid">
                  {/* Card 1: Total Mocks */}
                  <div className="sat-stat-card">
                    <div className="sat-stat-card-icon is-blue">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div className="sat-stat-card-body">
                      <span className="sat-stat-card-label">Available Mock Tests</span>
                      <strong className="sat-stat-card-value">
                        {unlockedPaperCount} Papers
                      </strong>
                      <span className="sat-stat-card-meta">
                        {subscription.active
                          ? `All ${satTests.length} Papers Unlocked`
                          : unlockedPaidCount
                          ? `${unlockedPaperCount} of ${satTests.length} papers unlocked`
                          : `3 Free Papers (3 of ${satTests.length} Unlocked)`}
                      </span>
                    </div>
                  </div>

                  {/* Card 2: Tests Completed */}
                  <div className="sat-stat-card">
                    <div className="sat-stat-card-icon is-green">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="sat-stat-card-body">
                      <span className="sat-stat-card-label">Tests Completed</span>
                      <strong className="sat-stat-card-value">{completedCount} / {satTests.length}</strong>
                      <span className="sat-stat-card-meta">
                        {Math.round((completedCount / satTests.length) * 100)}% progress achieved
                      </span>
                    </div>
                  </div>

                  {/* Card 3: Best Scale Score */}
                  <div className="sat-stat-card">
                    <div className="sat-stat-card-icon is-purple">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                        <path d="M4 22h16" />
                        <path d="M10 14.66V17c0 .55-.45 1-1 1H8v2h8v-2h-1c-.55 0-1-.45-1-1v-2.34" />
                        <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                      </svg>
                    </div>
                    <div className="sat-stat-card-body">
                      <span className="sat-stat-card-label">Highest Score</span>
                      <strong className="sat-stat-card-value">{bestScore} / 1600</strong>
                      <span className="sat-stat-card-meta">Official SAT scale</span>
                    </div>
                  </div>

                  {/* Card 4: Access Level */}
                  <div className="sat-stat-card">
                    <div className="sat-stat-card-icon is-amber">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                    <div className="sat-stat-card-body">
                      <span className="sat-stat-card-label">Access Status</span>
                      <strong className="sat-stat-card-value" style={{ fontSize: "19px" }}>
                        {subscription.active ? "Full Premium" : unlockedPaidCount ? "Paper Packs" : "Free Tier"}
                      </strong>
                      <span className="sat-stat-card-meta">
                        {subscription.active ? "Valid across all mocks" : `${unlockedPaperCount} papers unlocked`}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* ==================== SAT PAPERS CATALOG ==================== */}
              <section className="sat-papers-section" id="sat-papers-catalog">
                {/* Filter and Search Bar */}
                <div className="sat-papers-controls">
                  <div className="sat-filter-chips">
                    <button
                      type="button"
                      className={`sat-chip-btn ${filterType === "all" ? "is-active" : ""}`}
                      onClick={() => setFilterType("all")}
                    >
                      All Mocks ({satTests.length})
                    </button>
                    <button
                      type="button"
                      className={`sat-chip-btn ${filterType === "available" ? "is-active" : ""}`}
                      onClick={() => setFilterType("available")}
                    >
                      Available ({satTests.filter((test) => canAccessTest(test, subscription)).length})
                    </button>
                    <button
                      type="button"
                      className={`sat-chip-btn ${filterType === "completed" ? "is-active" : ""}`}
                      onClick={() => setFilterType("completed")}
                    >
                      Completed ({completedCount})
                    </button>
                  </div>

                  <div className="sat-search-wrap">
                    <svg className="sat-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      className="sat-search-input"
                      placeholder="Search mock tests (e.g. 01, Math)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* The 5-Cards Row Grid */}
                <div className="sat-dashboard-grid">
                  {paginatedTests.map((test) => {
                    const isCompleted = Boolean(completedMap[test.id]);
                    const testResult = completedMap[test.id];
                    const isFree = isFreeTest(test);
                    const canAccess = canAccessTest(test, subscription);
                    const packTestIds = isFree ? [] : getTestPack(test.id);

                    return (
                      <article
                        className={`sat-card-dashboard ${isCompleted ? "is-completed-card" : ""} ${!canAccess ? "is-locked-card" : ""}`}
                        key={test.id}
                        id={`sat-mock-card-${test.id}`}
                      >
                        {/* Card Top Row */}
                        <div className="sat-card-top-badge">
                          <div className="sat-card-num-box">
                            {test.id}
                          </div>
                          <div className="sat-card-pills-wrap">
                            {isCompleted && (
                              <span className="sat-card-completed-pill">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Completed</span>
                              </span>
                            )}
                            {isFree ? (
                              <span className="sat-card-free-pill">Free</span>
                            ) : canAccess ? (
                              <span className="sat-card-pro-pill">Pro</span>
                            ) : (
                              <span className="sat-card-pro-pill is-locked">🔒 Pro</span>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="sat-card-title">{test.title}</h3>

                        {/* Subjects */}
                        <div className="sat-card-subjects">
                          <span>Math</span>
                          <span>•</span>
                          <span>Reading</span>
                          <span>•</span>
                          <span>Writing</span>
                        </div>

                        {/* Meta information: 134 mins & 10 min break */}
                        <div className="sat-card-meta-row-clean">
                          <span className="sat-card-meta-item">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span>134 mins</span>
                          </span>
                          <span className="sat-card-meta-item">
                            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <rect x="2" y="10" width="3.5" height="8" rx="1" />
                              <rect x="8.2" y="5" width="3.5" height="13" rx="1" />
                              <rect x="14.5" y="1" width="3.5" height="17" rx="1" />
                            </svg>
                            <span>10 min break</span>
                          </span>
                        </div>

                        {/* Action Button: Start Test OR View Scorecard OR Unlock */}
                        <div className="sat-card-actions">
                          {isCompleted ? (
                            <Link
                              to={`/sat/results/${testResult?._id || test.id}`}
                              className="sat-btn-start-test sat-btn-view-card"
                              id={`sat-mock-btn-${test.id}`}
                            >
                              <span>View Scorecard</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                              </svg>
                            </Link>
                          ) : canAccess ? (
                            <Link
                              to={`/sat/mock-tests/${test.id}/instructions`}
                              className="sat-btn-start-test"
                              id={`sat-mock-btn-${test.id}`}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                              <span>Start Test</span>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPackTestIds(packTestIds);
                                setShowSubscriptionModal(true);
                              }}
                              className="sat-btn-start-test sat-btn-locked"
                              id={`sat-mock-btn-${test.id}`}
                              style={{ cursor: "pointer", border: "none" }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <span>Unlock Pack {packTestIds[0]}–{packTestIds[packTestIds.length - 1]} (₹999)</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* ==================== 5-PAPERS PAGINATION ==================== */}
                {totalPages > 1 && (
                  <div className="sat-pagination-bar">
                    <div className="sat-pagination-info">
                      Showing <strong>{startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredTests.length)}</strong> of <strong>{filteredTests.length}</strong> Mock Papers (Page {currentPage} of {totalPages})
                    </div>

                    <div className="sat-pagination-controls">
                      <button
                        type="button"
                        className="sat-page-nav-btn"
                        disabled={currentPage === 1}
                        onClick={() => goToPage(currentPage - 1)}
                        aria-label="Previous page"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                        <span>Previous</span>
                      </button>

                      <div className="sat-page-numbers">
                        {(() => {
                          const pages = [];
                          const delta = 2; // pages around current page
                          const left = Math.max(2, currentPage - delta);
                          const right = Math.min(totalPages - 1, currentPage + delta);

                          // Always show page 1
                          pages.push(1);

                          // Ellipsis after page 1 if needed
                          if (left > 2) pages.push("start-ellipsis");

                          // Middle pages
                          for (let i = left; i <= right; i++) pages.push(i);

                          // Ellipsis before last page if needed
                          if (right < totalPages - 1) pages.push("end-ellipsis");

                          // Always show last page
                          if (totalPages > 1) pages.push(totalPages);

                          return pages.map((pageNum, idx) =>
                            typeof pageNum === "string" ? (
                              <span key={pageNum} className="sat-page-ellipsis">…</span>
                            ) : (
                              <button
                                key={pageNum}
                                type="button"
                                className={`sat-page-num-btn ${currentPage === pageNum ? "is-active" : ""}`}
                                onClick={() => goToPage(pageNum)}
                                aria-current={currentPage === pageNum ? "page" : undefined}
                              >
                                {pageNum}
                              </button>
                            )
                          );
                        })()}
                      </div>

                      <button
                        type="button"
                        className="sat-page-nav-btn"
                        disabled={currentPage === totalPages}
                        onClick={() => goToPage(currentPage + 1)}
                        aria-label="Next page"
                      >
                        <span>Next</span>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {/* TAB: COUNSELING */}
          {activeTab === "counseling" && (
            <section className="sat-section-card sat-counseling-tab-card">
              <div className="sat-counseling-header-row">
                <div>
                  <h3 className="sat-section-card-title">SAT Counseling Sessions</h3>
                  <p className="sat-counseling-header-sub">
                    Book a personalized 30-minute counseling session after completing each mock test.
                  </p>
                </div>
                <Link
                  to="/sat/counseling"
                  className="sat-counseling-book-header-btn"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Book a Session →
                </Link>
              </div>

              {/* My Bookings Section */}
              {counselingBookings.length > 0 && (
                <div className="sat-counseling-bookings-section">
                  <div className="sat-csl-bookings-header">
                    <h4 className="sat-csl-section-heading">My Bookings</h4>
                    <span className="sat-csl-count-badge">
                      {counselingBookings.length} {counselingBookings.length === 1 ? "Session" : "Sessions"}
                    </span>
                  </div>

                  <div className="sat-csl-bookings-grid">
                    {counselingBookings.map((booking) => {
                      const isConfirmed = (booking.bookingStatus || "").toLowerCase() === "confirmed";
                      return (
                        <div key={booking._id} className="sat-csl-booking-card">
                          <div className="sat-csl-booking-left">
                            <div className="sat-csl-counselor-avatar">
                              {(booking.counselorName || "AC")
                                .split(" ")
                                .map((w) => w[0])
                                .slice(0, 2)
                                .join("")
                                .toUpperCase()}
                            </div>
                            <div className="sat-csl-booking-meta">
                              <div className="sat-csl-booking-top-line">
                                <h5 className="sat-csl-counselor-name">{booking.counselorName || "Aditya Cherikuri"}</h5>
                                <span className={`sat-csl-status-pill ${isConfirmed ? "is-confirmed" : "is-pending"}`}>
                                  <span className="sat-csl-status-dot" />
                                  {booking.bookingStatus ? booking.bookingStatus.toUpperCase() : "CONFIRMED"}
                                </span>
                              </div>
                              <div className="sat-csl-booking-test-tag">
                                {booking.mockTestTitle || `Full SAT Mock ${booking.mockTestId || "01"}`}
                              </div>
                              <div className="sat-csl-booking-datetime">
                                <span className="sat-csl-dt-item">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  {formatCounselingDate(booking.bookingDate)}
                                </span>
                                <span className="sat-csl-dt-divider">•</span>
                                <span className="sat-csl-dt-item">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                  {formatCounselingTime(booking.startTime)} – {formatCounselingTime(booking.endTime)} IST
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="sat-csl-booking-action">
                            {booking.meetingLink ? (
                              <a
                                href={booking.meetingLink}
                                target="_blank"
                                rel="noreferrer"
                                className="sat-csl-meet-btn"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                  <polygon points="23 7 16 12 23 17 23 7" />
                                  <rect x="1" y="5" width="15" height="14" rx="2" />
                                </svg>
                                Join Google Meet
                              </a>
                            ) : (
                              <span className="sat-csl-meeting-pending">
                                Meeting link will be sent via email
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pricing Info Cards */}
              <div className="sat-csl-plans-grid">
                <div className="sat-csl-plan-card is-free">
                  <div className="sat-csl-plan-top">
                    <h4>Mocks 01 – 03</h4>
                    <span className="sat-csl-price-badge is-free">Free</span>
                  </div>
                  <ul className="sat-csl-plan-bullets">
                    <li>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Free 30-minute counseling session
                    </li>
                    <li>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Personalized score analysis
                    </li>
                    <li>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Subject-wise improvement tips
                    </li>
                  </ul>
                </div>
                <div className="sat-csl-plan-card is-premium">
                  <div className="sat-csl-plan-top">
                    <h4>Mocks 04 onwards</h4>
                    <span className="sat-csl-price-badge is-premium">₹999 / session</span>
                  </div>
                  <ul className="sat-csl-plan-bullets">
                    <li>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      <strong>₹999 per 30-minute session</strong>
                    </li>
                    <li>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Expert SAT counselor guidance
                    </li>
                    <li>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Performance trend analysis
                    </li>
                    <li>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Study plan recommendations
                    </li>
                  </ul>
                </div>
              </div>

              {/* Completed mocks eligible for counseling */}
              {completedList.length === 0 ? (
                <div className="sat-empty-state">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  <h3>No mock tests completed yet</h3>
                  <p>Complete at least one mock test to become eligible for counseling.</p>
                  <button
                    type="button"
                    className="sat-btn-start-test"
                    style={{ margin: "14px auto 0", width: "fit-content", padding: "10px 20px" }}
                    onClick={() => handleTabChange("papers")}
                  >
                    Browse Mock Papers
                  </button>
                </div>
              ) : (
                <div className="sat-csl-eligible-section">
                  <h4 className="sat-csl-section-heading">Your Eligible Mock Tests</h4>
                  <div className="sat-csl-eligible-grid">
                    {completedList.map((item) => {
                      const mockNum = parseInt(String(item.testId).replace(/\D/g, ""), 10) || 0;
                      const isFree = isCounselingFree(mockNum);
                      const padId = String(item.testId).padStart(2, "0");
                      const isBooked = counselingBookings.some(
                        (b) => String(b.mockTestId).padStart(2, "0") === padId && b.bookingStatus !== "cancelled"
                      );

                      return (
                        <div
                          key={item._id || item.testId}
                          className={`sat-csl-eligible-card ${isBooked ? "is-booked" : ""}`}
                        >
                          <div className="sat-csl-eligible-card-content">
                            <div className="sat-csl-card-tag-row">
                              <span className="sat-csl-test-tag">MOCK {padId}</span>
                              <span className={`sat-csl-price-badge ${isFree ? "is-free" : "is-premium"}`}>
                                {isFree ? "✓ Free Session" : "₹999 Session"}
                              </span>
                            </div>

                            <h5 className="sat-csl-eligible-title">
                              {item.testTitle || `Full SAT Mock ${padId}`}
                            </h5>

                            <div className="sat-csl-score-chip">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2">
                                <line x1="18" y1="20" x2="18" y2="10" />
                                <line x1="12" y1="20" x2="12" y2="4" />
                                <line x1="6" y1="20" x2="6" y2="14" />
                              </svg>
                              <span>Scale Score: <strong>{item.scaleScore || 400} / 1600</strong></span>
                            </div>
                          </div>

                          <div className="sat-csl-card-footer">
                            {isBooked ? (
                              <div className="sat-csl-booked-notice">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Counseling session already booked</span>
                              </div>
                            ) : (
                              <Link
                                to={`/sat/counseling?mockTestId=${padId}`}
                                className="sat-csl-card-book-btn"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                  <rect x="3" y="4" width="18" height="18" rx="2" />
                                  <line x1="16" y1="2" x2="16" y2="6" />
                                  <line x1="8" y1="2" x2="8" y2="6" />
                                  <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                {isFree ? "Book Free 30-Min Session →" : `Book Session – ₹${COUNSELING_PAID_AMOUNT} →`}
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: RESULTS & PERFORMANCE */}
          {activeTab === "results" && (
            <section className="sat-section-card">
              <div className="sat-section-card-header">
                <div>
                  <h3 className="sat-section-card-title">All Completed SAT Mock Reports</h3>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
                    Review your scale score, module accuracy, and question-by-question explanations.
                  </p>
                </div>
              </div>

              {completedList.length === 0 ? (
                <div className="sat-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <line x1="9" y1="9" x2="15" y2="9" />
                    <line x1="9" y1="13" x2="15" y2="13" />
                    <line x1="9" y1="17" x2="13" y2="17" />
                  </svg>
                  <h3>No mock tests completed yet</h3>
                  <p>Attempt any of the {satTests.length} practice mock tests to view your score reports and analytics here.</p>
                  <button
                    type="button"
                    className="sat-btn-start-test"
                    style={{ margin: "16px auto 0", width: "fit-content", padding: "10px 20px" }}
                    onClick={() => handleTabChange("papers")}
                  >
                    Browse Mock Papers
                  </button>
                </div>
              ) : (
                <>
                  {/* Desktop Table View (>= 769px) */}
                  <div className="sat-results-table-wrap sat-results-desktop-only">
                    <table className="sat-results-table">
                      <thead>
                        <tr>
                          <th>Test Paper</th>
                          <th>Scale Score</th>
                          <th>Reading & Writing</th>
                          <th>Math</th>
                          <th>Date Completed</th>
                          <th>Detailed Scorecard</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completedList.map((item) => {
                          const rw = (item.modules?.[0]?.score || 0) + (item.modules?.[1]?.score || 0);
                          const math = (item.modules?.[2]?.score || 0) + (item.modules?.[3]?.score || 0);
                          const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Recently";

                          return (
                            <tr key={item._id || item.testId}>
                              <td>
                                <strong>{item.testTitle || `Full SAT Mock ${item.testId}`}</strong>
                              </td>
                              <td>
                                <span className="sat-results-score-badge">
                                  {item.scaleScore || 1500} / 1600
                                </span>
                              </td>
                              <td>{rw} / 54 questions</td>
                              <td>{math} / 44 questions</td>
                              <td>{dateStr}</td>
                              <td>
                                <Link
                                  to={`/sat/results/${item._id || item.testId}`}
                                  className="sat-btn-start-test sat-results-table-btn"
                                >
                                  View Full Analysis →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile High-Fidelity Cards (<= 768px) */}
                  <div className="sat-results-mobile-list">
                    {completedList.map((item) => {
                      const rw = (item.modules?.[0]?.score || 0) + (item.modules?.[1]?.score || 0);
                      const math = (item.modules?.[2]?.score || 0) + (item.modules?.[3]?.score || 0);
                      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Recently";

                      return (
                        <div key={item._id || item.testId} className="sat-results-card-item">
                          <div className="sat-rc-top">
                            <div className="sat-rc-title-block">
                              <span className="sat-rc-badge">Mock Test Completed</span>
                              <h4 className="sat-rc-title">{item.testTitle || `Full SAT Mock ${item.testId}`}</h4>
                            </div>
                            <div className="sat-rc-score-pill">
                              <span className="sat-rc-score-val">{item.scaleScore || 1500}</span>
                              <span className="sat-rc-score-max">/ 1600</span>
                            </div>
                          </div>

                          <div className="sat-rc-meta-row">
                            <span className="sat-rc-date">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                              </svg>
                              <span>{dateStr}</span>
                            </span>
                          </div>

                          <div className="sat-rc-stats-grid">
                            <div className="sat-rc-stat-box">
                              <span className="sat-rc-stat-label">Reading & Writing</span>
                              <strong className="sat-rc-stat-num">{rw} / 54</strong>
                            </div>
                            <div className="sat-rc-stat-box">
                              <span className="sat-rc-stat-label">Mathematics</span>
                              <strong className="sat-rc-stat-num">{math} / 44</strong>
                            </div>
                          </div>

                          <Link
                            to={`/sat/results/${item._id || item.testId}`}
                            className="sat-btn-start-test sat-rc-view-btn"
                          >
                            <span>View Full Analysis</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12" />
                              <polyline points="12 5 19 12 12 19" />
                            </svg>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* TAB 3: SUBSCRIPTION */}
          {activeTab === "subscription" && (
            <div className="sat-subscription-page-wrap">
              <section className="sat-upgrade-banner">
                <div className="sat-upgrade-copy">
                  <h3>{subscription.active ? "Full SAT Library Unlocked" : unlockedPaidCount ? "SAT Paper Packs" : "Choose a SAT Paper Pack"}</h3>
                  <p>
                    {subscription.active
                      ? `All ${satTests.length} full-length practice tests, complete analytics, and PDF score reports are unlocked.`
                      : unlockedPaidCount
                        ? `${unlockedPaidCount} paid papers are unlocked. Each \u20B9999 pack adds 10 SAT mocks for one year.`
                        : "Your first three SAT mocks are free. Each \u20B9999 pack unlocks 10 more papers for one year."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSubscriptionModal(true)}
                  className="sat-upgrade-btn"
                  style={{ cursor: "pointer", border: "none" }}
                >
                  {subscription.active ? "Manage Subscription" : "Buy a 10-Paper Pack"}
                </button>
              </section>

              <section className="sat-section-card">
                <h3 className="sat-section-card-title">Subscription Comparison</h3>
                <div className="sat-subscription-plans-grid">
                  <div className="sat-sub-plan-box is-free">
                    <div className="sat-sub-plan-header">
                      <h4>Free Tier</h4>
                      <span className="sat-sub-price-pill" style={{ background: "#f1f5f9", color: "#475569", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "700" }}>₹0 Free</span>
                    </div>
                    <ul style={{ marginTop: "12px" }}>
                      <li>Access to Mock Tests 01 through 03</li>
                      <li>Standard timed exam simulation</li>
                      <li>Instant raw score output & breakdown</li>
                      <li>Section & module score overview</li>
                      <li>Community support</li>
                    </ul>
                  </div>

                  <div className="sat-sub-plan-box is-premium">
                    <div className="sat-sub-plan-header">
                      <h4>10-Paper Pack</h4>
                      {subscription.active ? (
                        <span className="sat-subscription-badge is-premium" style={{ display: "inline-flex" }}>Active</span>
                      ) : (
                        <span className="sat-sub-price-pill is-premium-pill" style={{ background: "#eff6ff", color: "#2563eb", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "700" }}>₹999 / Pack</span>
                      )}
                    </div>
                    <ul style={{ marginTop: "12px" }}>
                      <li><strong>Choose any pack of 10 SAT mock papers (e.g. Papers 04–14)</strong></li>
                      <li>Adaptive module score tracking & analytics</li>
                      <li>Downloadable official PDF report card</li>
                      <li>Step-by-step math and verbal answer explanations</li>
                      <li>Priority student support</li>
                    </ul>
                    {!subscription.active && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPackTestIds(getNextTestPack(subscription.unlockedTestIds));
                          setShowSubscriptionModal(true);
                        }}
                        className="sat-btn-start-test"
                        style={{ display: "inline-flex", marginTop: "16px", padding: "10px 18px", width: "fit-content", cursor: "pointer", border: "none" }}
                      >
                        Buy a 10-Paper Pack ₹999 →</button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: EXAM GUIDELINES */}
          {activeTab === "instructions" && (
            <section className="sat-section-card">
              <div className="sat-section-card-header">
                <div>
                  <h3 className="sat-section-card-title">Digital SAT Exam Pattern & Instructions</h3>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
                    Official structure, timings, tools, and rules for test-day success.
                  </p>
                </div>
              </div>

              <div className="sat-guide-grid">
                <div className="sat-guide-box">
                  <h4>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>Test Structure & Timing</span>
                  </h4>
                  <ul className="sat-guide-list">
                    <li><strong>Section 1: Reading and Writing</strong>: 2 Modules, 27 questions each (54 questions total, 64 minutes).</li>
                    <li><strong>Mandatory Break</strong>: 10 minutes between Section 1 and Section 2.</li>
                    <li><strong>Section 2: Math</strong>: 2 Modules, 22 questions each (44 questions total, 70 minutes).</li>
                    <li><strong>Total Duration</strong>: 2 hours 14 minutes (134 minutes) plus 10 minutes break.</li>
                  </ul>
                </div>

                <div className="sat-guide-box">
                  <h4>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <line x1="9" y1="9" x2="15" y2="9" />
                    </svg>
                    <span>Scoring & Adaptive Format</span>
                  </h4>
                  <ul className="sat-guide-list">
                    <li>Scores range from <strong>400 to 1600</strong> total.</li>
                    <li>Reading & Writing is scored from <strong>200 to 800</strong>.</li>
                    <li>Math is scored from <strong>200 to 800</strong>.</li>
                    <li>No penalty for incorrect answers — always make an educated guess!</li>
                    <li>Module 2 difficulty adapts based on your performance in Module 1.</li>
                  </ul>
                </div>

                <div className="sat-guide-box">
                  <h4>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span>Test-Day Guidelines</span>
                  </h4>
                  <ul className="sat-guide-list">
                    <li>Ensure you have a stable internet connection before starting.</li>
                    <li>Use the built-in Desmos graphing calculator available for all Math modules.</li>
                    <li>Keep scratch paper and a pen handy for calculations.</li>
                    <li>Answers are saved automatically as you navigate through questions.</li>
                  </ul>
                </div>

                <div className="sat-guide-box">
                  <h4>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Ready to Practice?</span>
                  </h4>
                  <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 12px" }}>
                    Select any practice paper from the catalog to begin your timed mock exam under realistic testing conditions.
                  </p>
                  <button
                    type="button"
                    className="sat-btn-start-test"
                    style={{ width: "fit-content", padding: "10px 22px" }}
                    onClick={() => handleTabChange("papers")}
                  >
                    Go to SAT Practice Papers →
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* ==================== SUBSCRIPTION POPUP MODAL ==================== */}
      {showSubscriptionModal && (
        <SatSubscription
          isModal={true}
          onClose={() => setShowSubscriptionModal(false)}
          selectedTestIds={selectedPackTestIds}
          unlockedTestIds={subscription.unlockedTestIds}
          onSubscribed={(subObj) => {
            const unlockedTestIds = subObj?.unlockedTestIds || subscription.unlockedTestIds;
            const hasFullAccess = Boolean(subObj?.active || unlockedTestIds.length >= 57);
            setSubscription({
              loading: false,
              active: hasFullAccess,
              unlockedTestIds,
              expiresAt: subObj?.expiresAt || null,
              error: "",
            });
            setSelectedPackTestIds(getNextTestPack(unlockedTestIds));
            setShowSubscriptionModal(false);
          }}
        />
      )}
    </div>
  );
}

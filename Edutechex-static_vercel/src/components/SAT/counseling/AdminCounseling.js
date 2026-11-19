import React, { useEffect, useState, useCallback } from "react";
import "./adminCounseling.css";

const API_URL = (process.env.REACT_APP_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
const STORAGE_KEY = "edutechex-sat-registration";

function getStoredStudent() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "null"); }
  catch { return null; }
}
function satAuthHeaders() {
  const s = getStoredStudent();
  return s?.token ? { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` } : { "Content-Type": "application/json" };
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00+05:30").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

const STATUS_COLORS = {
  confirmed: "#10b981", pending: "#f59e0b", cancelled: "#ef4444",
  completed: "#6366f1", no_show: "#64748b",
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminCounseling() {
  const [activeTab, setActiveTab] = useState("bookings"); // bookings | counselors | slots
  const [bookings, setBookings] = useState([]);
  const [counselors, setCounselors] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [calendarStatus, setCalendarStatus] = useState({ isSuperAdmin: false, connected: false, connectedBy: null, connectedAt: null });
  const [calendarStatusLoaded, setCalendarStatusLoaded] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);

  // Add Counselor form
  const [showAddCounselor, setShowAddCounselor] = useState(false);
  const [newCounselor, setNewCounselor] = useState({ name: "", email: "", specialization: "SAT Counseling", bio: "", isAdmin: false });
  const [addingCounselor, setAddingCounselor] = useState(false);

  // Add Slots form
  const [selectedCounselorForSlots, setSelectedCounselorForSlots] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotStart, setSlotStart] = useState("09:00");
  const [slotsToAdd, setSlotsToAdd] = useState([]);
  const [addingSlots, setAddingSlots] = useState(false);
  const [blockedDate, setBlockedDate] = useState("");

  // Fetch bookings
  const fetchBookings = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/admin/counseling/bookings?status=${filterStatus}`, { headers: satAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setBookings(d.bookings || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterStatus]);

  // Fetch counselors
  const fetchCounselors = useCallback(() => {
    fetch(`${API_URL}/counselors`, { headers: satAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setCounselors(d.counselors || []); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);
  useEffect(() => { fetchCounselors(); }, [fetchCounselors]);

  const fetchCalendarStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/calendar/oauth/status`, { headers: satAuthHeaders() });
      const data = await response.json();
      if (response.ok) setCalendarStatus(data);
    } catch { /* status remains hidden until the admin check finishes */ }
    finally { setCalendarStatusLoaded(true); }
  }, []);
  useEffect(() => {
    fetchCalendarStatus();
    const calendar = new URLSearchParams(window.location.search).get("calendar");
    if (calendar === "connected") setMessage("Google Calendar connected successfully.");
    if (calendar === "error") {
      const reason = new URLSearchParams(window.location.search).get("reason");
      setMessage(reason === "no_refresh_token"
        ? "Google did not return a refresh token. Remove the existing EduTechEx app access from your Google Account and reconnect."
        : "Google Calendar connection failed. Please try again.");
    }
  }, [fetchCalendarStatus]);

  const connectCalendar = async () => {
    setCalendarBusy(true);
    try {
      const response = await fetch(`${API_URL}/calendar/oauth/authorize`, { headers: satAuthHeaders() });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Could not start Google authorization.");
      window.location.href = data.authorizationUrl;
    } catch (error) { setMessage(error.message || "Could not connect Google Calendar."); setCalendarBusy(false); }
  };

  const resyncBooking = async (bookingId) => {
    try {
      const response = await fetch(`${API_URL}/admin/counseling/${bookingId}/resync`, { method: "POST", headers: satAuthHeaders() });
      const data = await response.json();
      setMessage(data.calendarSyncStatus === "synced" ? "Calendar event synced and student confirmation email resent." : (data.syncError || "Calendar sync failed."));
      fetchBookings();
    } catch { setMessage("Could not retry calendar sync."); }
  };

  // Update booking status
  const updateStatus = async (bookingId, status, notes = "") => {
    try {
      const r = await fetch(`${API_URL}/admin/counseling/${bookingId}/status`, {
        method: "PATCH",
        headers: satAuthHeaders(),
        body: JSON.stringify({ status, notes }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setMessage(`Booking marked as ${status}.`);
        fetchBookings();
      } else {
        setMessage(d.error || "Failed to update status.");
      }
    } catch { setMessage("Network error. Try again."); }
    setTimeout(() => setMessage(""), 3000);
  };

  // Add counselor
  const handleAddCounselor = async (e) => {
    e.preventDefault();
    setAddingCounselor(true);
    try {
      const r = await fetch(`${API_URL}/counselors`, {
        method: "POST",
        headers: satAuthHeaders(),
        body: JSON.stringify(newCounselor),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setMessage("Counselor added successfully.");
        setShowAddCounselor(false);
        setNewCounselor({ name: "", email: "", specialization: "SAT Counseling", bio: "", isAdmin: false });
        fetchCounselors();
      } else {
        setMessage(d.error || "Failed to add counselor.");
      }
    } catch { setMessage("Network error."); }
    setAddingCounselor(false);
    setTimeout(() => setMessage(""), 4000);
  };

  // Add slot to pending list
  const addSlotToList = () => {
    if (!slotDate || !slotStart) return;
    const h = parseInt(slotStart.split(":")[0]);
    const m = parseInt(slotStart.split(":")[1]);
    const totalMin = h * 60 + m + 30;
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    setSlotsToAdd(prev => {
      const dup = prev.some(s => s.date === slotDate && s.startTime === slotStart);
      if (dup) return prev;
      return [...prev, { date: slotDate, startTime: slotStart, endTime }];
    });
  };

  // Submit slots
  const handleAddSlots = async () => {
    if (!selectedCounselorForSlots || slotsToAdd.length === 0) return;
    setAddingSlots(true);
    try {
      const r = await fetch(`${API_URL}/counselors/${selectedCounselorForSlots}/availability`, {
        method: "POST",
        headers: satAuthHeaders(),
        body: JSON.stringify({ slots: slotsToAdd }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setMessage(`${slotsToAdd.length} slot(s) added.`);
        setSlotsToAdd([]);
      } else {
        setMessage(d.error || "Failed to add slots.");
      }
    } catch { setMessage("Network error."); }
    setAddingSlots(false);
    setTimeout(() => setMessage(""), 4000);
  };

  // Block a date
  const handleBlockDate = async () => {
    if (!selectedCounselorForSlots || !blockedDate) return;
    const counselor = counselors.find(c => c._id === selectedCounselorForSlots);
    if (!counselor) return;
    const blocked = Array.isArray(counselor.blockedDates) ? [...new Set([...counselor.blockedDates, blockedDate])] : [blockedDate];
    try {
      const r = await fetch(`${API_URL}/counselors/${selectedCounselorForSlots}`, {
        method: "PUT",
        headers: satAuthHeaders(),
        body: JSON.stringify({ blockedDates: blocked }),
      });
      const d = await r.json();
      if (r.ok) { setMessage("Date blocked."); fetchCounselors(); setBlockedDate(""); }
      else setMessage(d.error || "Failed.");
    } catch { setMessage("Network error."); }
    setTimeout(() => setMessage(""), 3000);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="adm-page">
      <div className="adm-container">
        <div className="adm-header">
          <h1 className="adm-title">Counseling Admin Dashboard</h1>
          <p className="adm-sub">Manage bookings, counselors, and availability slots.</p>
        </div>

        {message && <div className="adm-message">{message}</div>}

        {/* Tabs */}
        <div className="adm-tabs">
          {["bookings", "counselors", "slots"].map(t => (
            <button key={t} type="button" className={`adm-tab-btn ${activeTab === t ? "is-active" : ""}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ═══ BOOKINGS TAB ═══ */}
        {activeTab === "bookings" && (
          <div className="adm-panel">
            <div className="adm-toolbar">
              {calendarStatusLoaded && calendarStatus.isSuperAdmin && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: calendarStatus.connected ? "#059669" : "#64748b", fontSize: 13 }}>
                  {calendarStatus.connected
                    ? `Google Calendar: Connected by ${calendarStatus.connectedBy || "admin"}${calendarStatus.connectedAt ? ` on ${new Date(calendarStatus.connectedAt).toLocaleDateString()}` : ""}`
                    : "Google Calendar: Not connected"}
                </span>
                <button type="button" className="adm-refresh-btn" disabled={calendarBusy} onClick={connectCalendar}>
                  {calendarBusy ? "Connecting…" : calendarStatus.connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
                </button>
              </div>}
              <div className="adm-filter-group">
                {["all", "confirmed", "pending", "completed", "cancelled", "no_show"].map(s => (
                  <button key={s} type="button"
                    className={`adm-filter-btn ${filterStatus === s ? "is-active" : ""}`}
                    onClick={() => setFilterStatus(s)}>
                    {s === "no_show" ? "No Show" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              {calendarStatusLoaded && calendarStatus.isSuperAdmin && !calendarStatus.connected && (
                <div className="adm-message" role="status">Google Calendar is not connected. Connect the shared organizational calendar to create Meet links for new bookings.</div>
              )}
              <button type="button" className="adm-refresh-btn" onClick={fetchBookings}>⟳ Refresh</button>
            </div>

            {loading ? (
              <div className="adm-loading">Loading bookings…</div>
            ) : bookings.length === 0 ? (
              <div className="adm-empty">No bookings found for this filter.</div>
            ) : (
              <div className="adm-bookings-list">
                {bookings.map(b => (
                  <div key={b._id} className="adm-booking-card">
                    <div className="adm-booking-top">
                      <div>
                        <div className="adm-booking-student">{b.studentName}</div>
                        <div className="adm-booking-email">{b.studentEmail}</div>
                      </div>
                      <div
                        className="adm-status-badge"
                        style={{ background: `${STATUS_COLORS[b.bookingStatus]}22`, color: STATUS_COLORS[b.bookingStatus] }}
                      >
                        {b.bookingStatus}
                      </div>
                    </div>

                    <div className="adm-booking-details">
                      <div className="adm-detail-row">
                        <span className="adm-detail-label">Mock Test</span>
                        <span className="adm-detail-val">{b.mockTestTitle} · Score: {b.mockTestScore}/1600</span>
                      </div>
                      <div className="adm-detail-row">
                        <span className="adm-detail-label">Counselor</span>
                        <span className="adm-detail-val">{b.counselorName}</span>
                      </div>
                      <div className="adm-detail-row">
                        <span className="adm-detail-label">Date & Time</span>
                        <span className="adm-detail-val">{formatDate(b.bookingDate)} · {formatTime(b.startTime)} – {formatTime(b.endTime)} IST</span>
                      </div>
                      <div className="adm-detail-row">
                        <span className="adm-detail-label">Session Type</span>
                        <span className="adm-detail-val">
                          {b.bookingType === "free"
                            ? <span style={{ color: "#10b981", fontWeight: 700 }}>Free</span>
                            : <span style={{ color: "#2563eb", fontWeight: 700 }}>Paid – ₹{(b.amount / 100).toFixed(0)}</span>}
                        </span>
                      </div>
                      {b.meetingLink && <div className="adm-detail-row"><span className="adm-detail-label">Google Meet</span><a className="adm-detail-val" href={b.meetingLink} target="_blank" rel="noreferrer">Join meeting</a></div>}
                      <div className="adm-detail-row"><span className="adm-detail-label">Calendar sync</span><span className="adm-detail-val">{b.calendarSyncStatus || "not synced"}</span></div>
                      {b.counselorNotes && (
                        <div className="adm-detail-row">
                          <span className="adm-detail-label">Notes</span>
                          <span className="adm-detail-val">{b.counselorNotes}</span>
                        </div>
                      )}
                    </div>

                    {!["cancelled", "completed"].includes(b.bookingStatus) && (
                      <div className="adm-booking-actions">
                        {b.bookingStatus === "pending" && (
                          <button type="button" className="adm-action-btn is-confirm" onClick={() => updateStatus(b._id, "confirmed")}>
                            ✓ Confirm
                          </button>
                        )}
                        {b.bookingStatus === "confirmed" && (
                          <button type="button" className="adm-action-btn is-complete" onClick={() => updateStatus(b._id, "completed")}>
                            ✓ Mark Completed
                          </button>
                        )}
                        <button type="button" className="adm-action-btn is-noshow" onClick={() => updateStatus(b._id, "no_show")}>
                          No Show
                        </button>
                        <button type="button" className="adm-action-btn is-cancel" onClick={() => updateStatus(b._id, "cancelled")}>
                          Cancel
                        </button>
                      </div>
                    )}
                    {calendarStatus.isSuperAdmin && b.calendarSyncStatus === "sync_failed" && b.bookingStatus === "confirmed" && (
                      <div className="adm-booking-actions"><button type="button" className="adm-action-btn is-confirm" onClick={() => resyncBooking(b._id)}>Resync Calendar & Email</button></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ COUNSELORS TAB ═══ */}
        {activeTab === "counselors" && (
          <div className="adm-panel">
            <div className="adm-toolbar">
              <button type="button" className="adm-add-btn" onClick={() => setShowAddCounselor(!showAddCounselor)}>
                + Add Counselor
              </button>
            </div>

            {showAddCounselor && (
              <form className="adm-form-card" onSubmit={handleAddCounselor}>
                <h3 className="adm-form-title">Add New Counselor</h3>
                <div className="adm-form-row">
                  <label>Full Name *</label>
                  <input type="text" required value={newCounselor.name} onChange={e => setNewCounselor(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Priya Sharma" className="adm-input" />
                </div>
                <div className="adm-form-row">
                  <label>Email *</label>
                  <input type="email" required value={newCounselor.email} onChange={e => setNewCounselor(p => ({ ...p, email: e.target.value }))} placeholder="counselor@edutechex.com" className="adm-input" />
                </div>
                <div className="adm-form-row">
                  <label>Specialization</label>
                  <input type="text" value={newCounselor.specialization} onChange={e => setNewCounselor(p => ({ ...p, specialization: e.target.value }))} className="adm-input" />
                </div>
                <div className="adm-form-row">
                  <label>Bio</label>
                  <textarea rows="2" value={newCounselor.bio} onChange={e => setNewCounselor(p => ({ ...p, bio: e.target.value }))} className="adm-input" placeholder="Short bio…" />
                </div>
                <div className="adm-form-row adm-checkbox-row">
                  <input type="checkbox" id="isAdmin" checked={newCounselor.isAdmin} onChange={e => setNewCounselor(p => ({ ...p, isAdmin: e.target.checked }))} />
                  <label htmlFor="isAdmin">Grant Admin Access (can manage own bookings)</label>
                </div>
                <div className="adm-form-actions">
                  <button type="submit" className="adm-add-btn" disabled={addingCounselor}>{addingCounselor ? "Adding…" : "Add Counselor"}</button>
                  <button type="button" className="adm-cancel-btn" onClick={() => setShowAddCounselor(false)}>Cancel</button>
                </div>
              </form>
            )}

            {counselors.length === 0 ? (
              <div className="adm-empty">No counselors yet. Add one above.</div>
            ) : (
              <div className="adm-counselors-list">
                {counselors.map(c => (
                  <div key={c._id} className="adm-counselor-row">
                    <div className="adm-counselor-avatar-sm">{(c.avatarInitials || c.name.slice(0, 2)).toUpperCase()}</div>
                    <div className="adm-counselor-meta">
                      <div className="adm-counselor-name">{c.name}</div>
                      <div className="adm-counselor-email">{c.email} · {c.specialization}</div>
                      <div className="adm-counselor-schedule">
                        {(c.availableDays || []).join(", ")} · {c.workingHours?.start} – {c.workingHours?.end}
                      </div>
                    </div>
                    <div className={`adm-status-badge ${c.status === "active" ? "is-active" : "is-inactive"}`}>{c.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ SLOTS TAB ═══ */}
        {activeTab === "slots" && (
          <div className="adm-panel">
            <h3 className="adm-form-title">Manage Availability Slots</h3>

            <div className="adm-form-row">
              <label>Select Counselor</label>
              <select className="adm-input" value={selectedCounselorForSlots} onChange={e => setSelectedCounselorForSlots(e.target.value)}>
                <option value="">– Choose counselor –</option>
                {counselors.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>

            {selectedCounselorForSlots && (
              <>
                <div className="adm-slots-add-section">
                  <h4 className="adm-sub-title">Add Time Slots</h4>
                  <div className="adm-slot-input-row">
                    <div className="adm-form-row" style={{ flex: 1, marginBottom: 0 }}>
                      <label>Date</label>
                      <input type="date" className="adm-input" value={slotDate} min={new Date().toISOString().split("T")[0]} onChange={e => setSlotDate(e.target.value)} />
                    </div>
                    <div className="adm-form-row" style={{ flex: 1, marginBottom: 0 }}>
                      <label>Start Time (30 min slot)</label>
                      <input type="time" className="adm-input" value={slotStart} onChange={e => setSlotStart(e.target.value)} step="1800" />
                    </div>
                    <button type="button" className="adm-add-slot-btn" onClick={addSlotToList}>+ Add to List</button>
                  </div>

                  {slotsToAdd.length > 0 && (
                    <div className="adm-pending-slots">
                      <div className="adm-pending-label">Pending slots to save ({slotsToAdd.length})</div>
                      <div className="adm-pending-list">
                        {slotsToAdd.map((s, i) => (
                          <div key={i} className="adm-pending-slot-item">
                            {s.date} · {formatTime(s.startTime)} – {formatTime(s.endTime)}
                            <button type="button" className="adm-remove-slot-btn" onClick={() => setSlotsToAdd(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                          </div>
                        ))}
                      </div>
                      <button type="button" className="adm-add-btn" disabled={addingSlots} onClick={handleAddSlots}>
                        {addingSlots ? "Saving…" : `Save ${slotsToAdd.length} Slot(s)`}
                      </button>
                    </div>
                  )}
                </div>

                <div className="adm-block-section">
                  <h4 className="adm-sub-title">Block a Date (Mark Counselor Unavailable)</h4>
                  <div className="adm-slot-input-row">
                    <input type="date" className="adm-input" value={blockedDate} min={new Date().toISOString().split("T")[0]} onChange={e => setBlockedDate(e.target.value)} style={{ flex: 1 }} />
                    <button type="button" className="adm-add-btn" onClick={handleBlockDate} disabled={!blockedDate}>Block Date</button>
                  </div>
                  {/* Blocked dates list */}
                  {(() => {
                    const c = counselors.find(co => co._id === selectedCounselorForSlots);
                    return c?.blockedDates?.length > 0 ? (
                      <div className="adm-pending-slots">
                        <div className="adm-pending-label">Blocked Dates</div>
                        <div className="adm-pending-list">
                          {c.blockedDates.map(d => <div key={d} className="adm-pending-slot-item">{d}</div>)}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


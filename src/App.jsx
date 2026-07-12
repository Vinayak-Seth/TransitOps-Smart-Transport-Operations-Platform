import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Truck, User, Route, Wrench, Fuel, BarChart3, LayoutDashboard,
  LogOut, Moon, Sun, Search, Plus, X, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle2, Clock, Ban, FileText, Download,
  Printer, Bell, ShieldCheck, Trash2, Edit3, MapPin, Gauge,
  Menu, Upload, Paperclip, Mail, History
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from "recharts";

/* ============================== TOKENS ============================== */
const THEMES = {
  dark: {
    "--bg": "#12161C", "--bg-elev": "#1A2029", "--bg-elev2": "#212834",
    "--border": "#2B333F", "--text": "#E7EBEF", "--text-dim": "#8A97A5",
    "--amber": "#FFB020", "--teal": "#22B8B0", "--green": "#3DDC84",
    "--red": "#FF5C5C", "--blue": "#5B8DEF",
  },
  light: {
    "--bg": "#F1F4F7", "--bg-elev": "#FFFFFF", "--bg-elev2": "#E9EDF2",
    "--border": "#D7DEE6", "--text": "#171B21", "--text-dim": "#5B6773",
    "--amber": "#C77900", "--teal": "#0E8783", "--green": "#1E9E5C",
    "--red": "#D1373F", "--blue": "#2E5DC4",
  },
};

const STATUS_COLOR = {
  Available: "green", "On Trip": "teal", "In Shop": "amber", Retired: "red",
  "Off Duty": "text-dim", Suspended: "red",
  Draft: "amber", Dispatched: "teal", Completed: "green", Cancelled: "red",
  Active: "amber", Closed: "green",
};

const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysUntil = (dateStr) => Math.ceil((new Date(dateStr) - new Date(todayISO())) / 86400000);
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/* Dynamically load an external script once (used for real client-side PDF generation) */
const _scriptCache = {};
function loadScript(src) {
  if (_scriptCache[src]) return _scriptCache[src];
  _scriptCache[src] = new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = true; s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.body.appendChild(s);
  });
  return _scriptCache[src];
}

/* Read a File into a base64 data URL for real client-side document storage (fallback path) */
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================== REAL BACKEND ADAPTER ==============================
   Reads credentials from Vite env vars (.env file — see SETUP_REAL_BACKEND.md).
   If Supabase/EmailJS aren't configured, everything gracefully falls back to
   window.storage (Claude artifact) or a localStorage polyfill (plain browser),
   so the app never breaks — it just runs in "local demo" mode instead of "real backend" mode.
*/
const ENV = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
const SUPABASE_URL = ENV.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY || "";
const EMAILJS_SERVICE_ID = ENV.VITE_EMAILJS_SERVICE_ID || "";
const EMAILJS_TEMPLATE_ID = ENV.VITE_EMAILJS_TEMPLATE_ID || "";
const EMAILJS_PUBLIC_KEY = ENV.VITE_EMAILJS_PUBLIC_KEY || "";

const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const isEmailConfigured = !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);

let _supabasePromise = null;
async function getSupabase() {
  if (!isSupabaseConfigured) return null;
  if (!_supabasePromise) {
    _supabasePromise = import("@supabase/supabase-js")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
      .catch((err) => { console.error("Supabase client failed to load:", err); return null; });
  }
  return _supabasePromise;
}

/* Load the whole fleet dataset — real Postgres row if Supabase is configured, else local fallback */
async function loadFleetData(fallbackGet) {
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.from("fleet_data").select("payload").eq("id", "main").single();
    if (!error && data) return data.payload;
  }
  return fallbackGet();
}

/* Persist the whole fleet dataset — real Postgres upsert if Supabase is configured, else local fallback */
async function saveFleetData(payload, fallbackSet) {
  const sb = await getSupabase();
  if (sb) {
    const { error } = await sb.from("fleet_data").upsert({ id: "main", payload, updated_at: new Date().toISOString() });
    if (!error) return true;
    console.error("Supabase save failed, falling back to local storage:", error);
  }
  return fallbackSet();
}

/* Upload a real file to Supabase Storage; falls back to base64-in-JSON if not configured */
async function uploadDocument(vehicleId, file) {
  const sb = await getSupabase();
  if (sb) {
    const path = `${vehicleId}/${Date.now()}-${file.name}`;
    const { error } = await sb.storage.from("vehicle-documents").upload(path, file);
    if (!error) {
      const { data } = sb.storage.from("vehicle-documents").getPublicUrl(path);
      return { fileUrl: data.publicUrl, fileName: file.name, fileType: file.type, storage: "supabase" };
    }
    console.error("Supabase upload failed, falling back to local base64 storage:", error);
  }
  const dataUrl = await fileToDataURL(file);
  return { fileData: dataUrl, fileName: file.name, fileType: file.type, storage: "local" };
}

/* Send a real email via EmailJS (client-side capable, unlike SendGrid which needs a hidden server-side key).
   Returns { ok, reason } — reason explains why it didn't send when ok is false. */
async function sendReminderEmail(driver, extra) {
  if (!driver.email) return { ok: false, reason: "no_email" };
  if (!isEmailConfigured) return { ok: false, reason: "not_configured" };
  try {
    const emailjs = await import("@emailjs/browser");
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: driver.email,
      driver_name: driver.name,
      license_number: driver.licenseNumber,
      license_expiry: driver.licenseExpiry,
      days_left: extra.days,
    }, { publicKey: EMAILJS_PUBLIC_KEY });
    return { ok: true };
  } catch (err) {
    console.error("EmailJS send failed:", err);
    return { ok: false, reason: "send_error" };
  }
}


/* ============================== SEED DATA ============================== */
function seedAccounts() {
  return [
    { email: "fleetmgr@transitops.com", password: "demo123", role: "Fleet Manager", name: "Priya Sharma" },
    { email: "driver@transitops.com", password: "demo123", role: "Driver", name: "Alex Rao" },
    { email: "safety@transitops.com", password: "demo123", role: "Safety Officer", name: "Meera Nair" },
    { email: "finance@transitops.com", password: "demo123", role: "Financial Analyst", name: "Karan Mehta" },
    { email: "admin@transitops.com", password: "demo123", role: "Admin", name: "Admin User" },
  ];
}

function seedFleet() {
  const v = [
    { id: "V1", regNumber: "UP32-VN-0501", name: "Tempo Van", type: "Van", maxCapacity: 500, odometer: 12500, acquisitionCost: 850000, status: "Available", region: "North", documents: [{ id: uid("d"), name: "Insurance Policy", note: "Valid till 2027", date: "2026-01-10" }] },
    { id: "V2", regNumber: "MH12-TR-1109", name: "Tata 1109 Truck", type: "Truck", maxCapacity: 3000, odometer: 45210, acquisitionCost: 2100000, status: "On Trip", region: "West", documents: [] },
    { id: "V3", regNumber: "TN09-TR-0707", name: "Ashok Leyland 1616", type: "Truck", maxCapacity: 5000, odometer: 88210, acquisitionCost: 3200000, status: "In Shop", region: "South", documents: [] },
    { id: "V4", regNumber: "WB02-VN-0212", name: "Mahindra Bolero Pickup", type: "Van", maxCapacity: 750, odometer: 30210, acquisitionCost: 950000, status: "Available", region: "East", documents: [] },
    { id: "V5", regNumber: "DL04-BK-0101", name: "Bajaj Cargo Bike", type: "Bike", maxCapacity: 50, odometer: 8000, acquisitionCost: 120000, status: "Available", region: "Central", documents: [] },
    { id: "V6", regNumber: "UP32-TR-1414", name: "Eicher Pro 3015", type: "Truck", maxCapacity: 4000, odometer: 5000, acquisitionCost: 2800000, status: "Retired", region: "North", documents: [] },
  ];
  const d = [
    { id: "D1", name: "Alex Rao", email: "alex.rao@transitops.com", licenseNumber: "LIC-2291", licenseCategory: "LMV", licenseExpiry: "2027-03-01", contact: "9876500001", safetyScore: 92, status: "Available" },
    { id: "D2", name: "Sana Iqbal", email: "sana.iqbal@transitops.com", licenseNumber: "LIC-3382", licenseCategory: "HMV", licenseExpiry: "2026-08-01", contact: "9876500002", safetyScore: 88, status: "Available" },
    { id: "D3", name: "Vikram Singh", email: "vikram.singh@transitops.com", licenseNumber: "LIC-1187", licenseCategory: "HMV", licenseExpiry: "2025-01-01", contact: "9876500003", safetyScore: 75, status: "Suspended" },
    { id: "D4", name: "Farah Khan", email: "farah.khan@transitops.com", licenseNumber: "LIC-4456", licenseCategory: "LMV", licenseExpiry: "2027-11-11", contact: "9876500004", safetyScore: 95, status: "On Trip" },
    { id: "D5", name: "Rohit Verma", email: "rohit.verma@transitops.com", licenseNumber: "LIC-5567", licenseCategory: "HMV", licenseExpiry: "2026-07-20", contact: "9876500005", safetyScore: 80, status: "Available" },
    { id: "D6", name: "Divya Nair", email: "divya.nair@transitops.com", licenseNumber: "LIC-6678", licenseCategory: "LMV", licenseExpiry: "2028-01-01", contact: "9876500006", safetyScore: 90, status: "Off Duty" },
  ];
  const t = [
    { id: "T1", source: "Lucknow", destination: "Kanpur", vehicleId: "V1", driverId: "D1", cargoWeight: 400, plannedDistance: 90, actualDistance: null, fuelConsumed: null, revenue: 0, status: "Draft", createdAt: "2026-07-10" },
    { id: "T2", source: "Delhi", destination: "Mumbai", vehicleId: "V2", driverId: "D4", cargoWeight: 2500, plannedDistance: 1400, actualDistance: null, fuelConsumed: null, revenue: 0, status: "Dispatched", createdAt: "2026-07-09", dispatchedAt: "2026-07-09" },
    { id: "T3", source: "Kolkata", destination: "Bhubaneswar", vehicleId: "V4", driverId: "D6", cargoWeight: 600, plannedDistance: 440, actualDistance: 452, fuelConsumed: 58, revenue: 42000, status: "Completed", createdAt: "2026-06-20", dispatchedAt: "2026-06-20", completedAt: "2026-06-22" },
  ];
  const m = [
    { id: "M1", vehicleId: "V3", type: "Brake Repair", cost: 15000, date: "2026-07-05", status: "Active", notes: "Rear brake pad replacement" },
    { id: "M2", vehicleId: "V4", type: "Oil Change", cost: 3200, date: "2026-06-15", status: "Closed", notes: "" },
  ];
  const f = [
    { id: "F1", vehicleId: "V2", liters: 320, cost: 32000, date: "2026-07-08", tripId: "T2" },
    { id: "F2", vehicleId: "V4", liters: 58, cost: 5800, date: "2026-06-22", tripId: "T3" },
    { id: "F3", vehicleId: "V1", liters: 40, cost: 4000, date: "2026-07-01", tripId: null },
  ];
  const e = [
    { id: "E1", vehicleId: "V2", category: "Toll", amount: 2400, date: "2026-07-08", note: "NH48 tolls" },
    { id: "E2", vehicleId: "V4", category: "Toll", amount: 900, date: "2026-06-21", note: "Kolkata-Bhubaneswar tolls" },
  ];
  return { vehicles: v, drivers: d, trips: t, maintenance: m, fuelLogs: f, expenses: e, reminderLog: [] };
}

/* ============================== PERMISSIONS ============================== */
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "vehicles", label: "Vehicles", icon: Truck },
  { key: "drivers", label: "Drivers", icon: User },
  { key: "trips", label: "Trips", icon: Route },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
  { key: "fuel", label: "Fuel & Expenses", icon: Fuel },
  { key: "reports", label: "Reports", icon: BarChart3 },
];

const NAV_BY_ROLE = {
  Admin: NAV.map(n => n.key),
  "Fleet Manager": ["dashboard", "vehicles", "drivers", "trips", "maintenance", "fuel", "reports"],
  Driver: ["dashboard", "trips", "vehicles", "drivers"],
  "Safety Officer": ["dashboard", "drivers", "trips", "reports"],
  "Financial Analyst": ["dashboard", "fuel", "reports", "vehicles"],
};

const EDIT_BY_ROLE = {
  vehicles: ["Admin", "Fleet Manager"],
  drivers: ["Admin", "Fleet Manager", "Safety Officer"],
  trips: ["Admin", "Fleet Manager", "Driver"],
  maintenance: ["Admin", "Fleet Manager"],
  fuel: ["Admin", "Fleet Manager", "Financial Analyst"],
};
const canEdit = (tab, role) => (EDIT_BY_ROLE[tab] || []).includes(role);

/* ============================== SMALL UI ATOMS ============================== */
const Pill = ({ status }) => {
  const c = STATUS_COLOR[status] || "text-dim";
  return (
    <span className="pill" style={{ "--pc": `var(--${c})` }}>
      <span className="pill-dot" />{status}
    </span>
  );
};

const RouteDivider = ({ label }) => (
  <div className="route-divider">
    {label && <span className="route-label">{label}</span>}
    <div className="route-line"><span className="route-marker">▸</span></div>
  </div>
);

const Stat = ({ label, value, icon: Icon, accent }) => (
  <div className="stat-card">
    <div className="stat-top">
      <span className="stat-label">{label}</span>
      <Icon size={16} style={{ color: `var(--${accent || "teal"})` }} />
    </div>
    <div className="stat-value">{value}</div>
  </div>
);

function SortHeader({ label, field, sort, setSort }) {
  const active = sort.field === field;
  return (
    <th onClick={() => setSort(s => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }))} className="th-sort">
      {label}
      {active ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
    </th>
  );
}

function sortRows(rows, sort) {
  if (!sort.field) return rows;
  const arr = [...rows].sort((a, b) => {
    const av = a[sort.field], bv = b[sort.field];
    if (av == null) return 1; if (bv == null) return -1;
    if (typeof av === "number") return av - bv;
    return String(av).localeCompare(String(bv));
  });
  return sort.dir === "desc" ? arr.reverse() : arr;
}

function exportCSV(filename, rows, columns) {
  const header = columns.map(c => c.label).join(",");
  const lines = rows.map(r => columns.map(c => {
    const v = typeof c.get === "function" ? c.get(r) : r[c.key];
    const s = (v ?? "").toString().replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " modal-wide" : "")}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <label className="field"><span>{label}</span>{children}</label>
);

/* ============================== LOGIN ============================== */
function Login({ accounts, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const acc = accounts.find(a => a.email.toLowerCase() === email.toLowerCase() && a.password === password);
    if (!acc) { setError("Invalid email or password."); return; }
    onLogin(acc);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <Route size={22} style={{ color: "var(--amber)" }} />
          <span>TransitOps</span>
        </div>
        <p className="login-sub">Smart Transport Operations Platform</p>
        <form onSubmit={submit} className="login-form">
          <Field label="Email">
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@transitops.com" autoFocus />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && <div className="form-error"><AlertTriangle size={14} />{error}</div>}
          <button className="btn btn-primary" type="submit">Sign in</button>
        </form>
        <RouteDivider label="Demo accounts" />
        <div className="demo-grid">
          {accounts.map(a => (
            <button key={a.email} className="demo-chip" onClick={() => { setEmail(a.email); setPassword(a.password); }}>
              <ShieldCheck size={12} /> {a.role}
            </button>
          ))}
        </div>
        <p className="login-hint">Password for every demo account: <code>demo123</code></p>
      </div>
    </div>
  );
}

/* ============================== MAIN APP ============================== */
export default function App() {
  const [theme, setTheme] = useState("dark");
  const [accounts, setAccounts] = useState(null);
  const [data, setData] = useState(null);
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [backendMode, setBackendMode] = useState(isSupabaseConfigured ? "supabase" : "local");

  useEffect(() => {
    (async () => {
      try {
        let acc;
        try { acc = JSON.parse((await window.storage.get("transitops-accounts", true)).value); }
        catch { acc = seedAccounts(); await window.storage.set("transitops-accounts", JSON.stringify(acc), true); }

        const fallbackGet = async () => {
          try { return JSON.parse((await window.storage.get("transitops-fleet", true)).value); }
          catch { const seeded = seedFleet(); await window.storage.set("transitops-fleet", JSON.stringify(seeded), true); return seeded; }
        };
        let fleet = await loadFleetData(fallbackGet);
        if (!fleet || Object.keys(fleet).length === 0) fleet = await fallbackGet();
        if (!fleet.reminderLog) fleet.reminderLog = [];
        setAccounts(acc); setData(fleet);
      } catch (err) {
        setAccounts(seedAccounts()); setData(seedFleet());
      } finally { setReady(true); }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    const fallbackSet = async () => { try { await window.storage.set("transitops-fleet", JSON.stringify(next), true); return true; } catch { return false; } };
    const savedRemotely = await saveFleetData(next, fallbackSet);
    setBackendMode(isSupabaseConfigured && savedRemotely ? "supabase" : "local");
  }, []);

  const notify = (msg, kind = "ok") => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200); };

  useEffect(() => {
    const themeVars = THEMES[theme];
    const root = document.documentElement;
    Object.entries(themeVars).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [theme]);

  if (!ready) return <div className="boot"><Route size={26} /><span>Loading TransitOps…</span></div>;

  if (!session) return (
    <div className="app-root">
      <StyleSheet />
      <Login accounts={accounts} onLogin={setSession} />
    </div>
  );

  const visibleNav = NAV.filter(n => (NAV_BY_ROLE[session.role] || []).includes(n.key));

  return (
    <div className="app-root">
      <StyleSheet />
      {mobileNavOpen && <div className="mobile-scrim" onClick={() => setMobileNavOpen(false)} />}
      <aside className={"sidebar" + (mobileNavOpen ? " open" : "")}>
        <div className="brand"><Route size={20} style={{ color: "var(--amber)" }} /><span>TransitOps</span>
          <button className="icon-btn mobile-close" onClick={() => setMobileNavOpen(false)}><X size={16} /></button>
        </div>
        <nav>
          {visibleNav.map(n => (
            <button key={n.key} className={"nav-item" + (tab === n.key ? " active" : "")} onClick={() => { setTab(n.key); setMobileNavOpen(false); }}>
              <n.icon size={16} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{session.name.split(" ").map(w => w[0]).join("").slice(0,2)}</div>
            <div>
              <div className="user-name">{session.name}</div>
              <div className="user-role">{session.role}</div>
            </div>
          </div>
          <button className="nav-item" onClick={() => setSession(null)}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-menu-btn" onClick={() => setMobileNavOpen(true)}><Menu size={18} /></button>
            <div className="topbar-title">{NAV.find(n => n.key === tab)?.label}</div>
          </div>
          <div className="topbar-actions">
            <span className={"backend-badge " + (backendMode === "supabase" ? "ok" : "warn")}>
              <span className="dot" /> {backendMode === "supabase" ? "Synced to Supabase" : "Local mode (no backend configured)"}
            </span>
            <button className="icon-btn" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <div className="content">
          {tab === "dashboard" && <Dashboard data={data} persist={persist} notify={notify} />}
          {tab === "vehicles" && <VehiclesTab data={data} persist={persist} role={session.role} notify={notify} />}
          {tab === "drivers" && <DriversTab data={data} persist={persist} role={session.role} notify={notify} />}
          {tab === "trips" && <TripsTab data={data} persist={persist} role={session.role} notify={notify} />}
          {tab === "maintenance" && <MaintenanceTab data={data} persist={persist} role={session.role} notify={notify} />}
          {tab === "fuel" && <FuelTab data={data} persist={persist} role={session.role} notify={notify} />}
          {tab === "reports" && <ReportsTab data={data} role={session.role} notify={notify} />}
        </div>
      </main>

      {toast && <div className={"toast toast-" + toast.kind}>{toast.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {toast.msg}</div>}
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
function Dashboard({ data, persist, notify }) {
  const [fType, setFType] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fRegion, setFRegion] = useState("All");
  const [showLog, setShowLog] = useState(false);

  const types = ["All", ...new Set(data.vehicles.map(v => v.type))];
  const regions = ["All", ...new Set(data.vehicles.map(v => v.region))];
  const statuses = ["All", "Available", "On Trip", "In Shop", "Retired"];

  const filtered = data.vehicles.filter(v =>
    (fType === "All" || v.type === fType) &&
    (fStatus === "All" || v.status === fStatus) &&
    (fRegion === "All" || v.region === fRegion)
  );

  const active = filtered.filter(v => v.status !== "Retired").length;
  const avail = filtered.filter(v => v.status === "Available").length;
  const inShop = filtered.filter(v => v.status === "In Shop").length;
  const onTrip = filtered.filter(v => v.status === "On Trip").length;
  const util = active ? Math.round((onTrip / active) * 100) : 0;
  const activeTrips = data.trips.filter(t => t.status === "Dispatched").length;
  const pendingTrips = data.trips.filter(t => t.status === "Draft").length;
  const driversOnDuty = data.drivers.filter(d => d.status === "On Trip").length;

  const pieData = ["Available", "On Trip", "In Shop", "Retired"].map(s => ({ name: s, value: filtered.filter(v => v.status === s).length }));
  const pieColors = { Available: "var(--green)", "On Trip": "var(--teal)", "In Shop": "var(--amber)", Retired: "var(--red)" };

  const expiringSoon = data.drivers
    .map(d => ({ ...d, days: daysUntil(d.licenseExpiry) }))
    .filter(d => d.days <= 30)
    .sort((a, b) => a.days - b.days);

  const reminderLog = data.reminderLog || [];
  const lastSentFor = (driverId) => {
    const entries = reminderLog.filter(r => r.driverId === driverId).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    return entries[0] || null;
  };
  const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;

  const [sendingId, setSendingId] = useState(null);

  const sendReminder = async (driver) => {
    const daysLeft = daysUntil(driver.licenseExpiry);
    const last = lastSentFor(driver.id);
    if (last && hoursSince(last.sentAt) < 24) {
      notify(`A reminder was already sent to ${driver.name} in the last 24 hours.`, "err");
      return;
    }
    if (!driver.email) {
      notify(`${driver.name} has no email on file — add one in Drivers before sending.`, "err");
      return;
    }
    setSendingId(driver.id);
    const result = await sendReminderEmail(driver, { days: daysLeft });
    setSendingId(null);

    if (result.ok) {
      const entry = { id: uid("R"), driverId: driver.id, driverName: driver.name, licenseNumber: driver.licenseNumber, sentAt: new Date().toISOString(), channel: "Email (EmailJS)", to: driver.email };
      persist({ ...data, reminderLog: [entry, ...reminderLog] });
      notify(`Real email sent to ${driver.email}.`);
      return;
    }
    if (result.reason === "not_configured") {
      const entry = { id: uid("R"), driverId: driver.id, driverName: driver.name, licenseNumber: driver.licenseNumber, sentAt: new Date().toISOString(), channel: "In-app only (EmailJS not configured)", to: driver.email };
      persist({ ...data, reminderLog: [entry, ...reminderLog] });
      notify("Logged in-app — add EmailJS credentials to .env to send a real email (see SETUP_REAL_BACKEND.md).", "err");
      return;
    }
    notify("Email failed to send — check your EmailJS credentials and connection.", "err");
  };

  return (
    <div>
      <div className="filter-row">
        <select value={fType} onChange={e => setFType(e.target.value)}>{types.map(t => <option key={t}>{t}</option>)}</select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}>{statuses.map(t => <option key={t}>{t}</option>)}</select>
        <select value={fRegion} onChange={e => setFRegion(e.target.value)}>{regions.map(t => <option key={t}>{t}</option>)}</select>
      </div>

      <div className="stat-grid">
        <Stat label="Active Vehicles" value={active} icon={Truck} accent="teal" />
        <Stat label="Available Vehicles" value={avail} icon={CheckCircle2} accent="green" />
        <Stat label="In Maintenance" value={inShop} icon={Wrench} accent="amber" />
        <Stat label="Active Trips" value={activeTrips} icon={Route} accent="teal" />
        <Stat label="Pending Trips" value={pendingTrips} icon={Clock} accent="amber" />
        <Stat label="Drivers On Duty" value={driversOnDuty} icon={User} accent="teal" />
        <Stat label="Fleet Utilization" value={util + "%"} icon={Gauge} accent="blue" />
      </div>

      <RouteDivider label="Fleet snapshot" />

      <div className="grid-2">
        <div className="panel">
          <h4>Vehicle status composition</h4>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                {pieData.map((e, i) => <Cell key={i} fill={pieColors[e.name]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="panel-head-row">
            <h4><Bell size={14} style={{ verticalAlign: -2 }} /> License reminder center</h4>
            <button className="link-btn" onClick={() => setShowLog(s => !s)}><History size={13} /> {showLog ? "Hide log" : "View log"}</button>
          </div>
          <p className="muted small disclaimer">
            {isEmailConfigured
              ? "EmailJS is connected — \"Send reminder\" dispatches a real email to the driver's address on file, with a 24h dedupe and full audit trail below."
              : "EmailJS isn't connected yet, so reminders are logged in-app only for now. Add your EmailJS credentials to .env (see SETUP_REAL_BACKEND.md) to make \"Send reminder\" deliver a real email — no other code changes needed."}
          </p>
          {expiringSoon.length === 0 && <p className="muted">No licenses expiring within 30 days.</p>}
          <ul className="reminder-list">
            {expiringSoon.map(d => {
              const last = lastSentFor(d.id);
              const onCooldown = last && hoursSince(last.sentAt) < 24;
              const sending = sendingId === d.id;
              return (
                <li key={d.id} className={d.days < 0 ? "danger" : "warn"}>
                  <span>{d.name} — {d.licenseNumber}<br /><span className="muted small">{d.email || "no email on file"} · {d.days < 0 ? `Expired ${Math.abs(d.days)}d ago` : `Expires in ${d.days}d`}{last && ` · last reminded ${fmtDateTime(last.sentAt)}`}</span></span>
                  <button className="btn btn-sm" disabled={onCooldown || sending || !d.email} onClick={() => sendReminder(d)}>
                    <Mail size={12} /> {sending ? "Sending…" : onCooldown ? "Sent" : "Send reminder"}
                  </button>
                </li>
              );
            })}
          </ul>
          {showLog && (
            <div className="reminder-log">
              <h5>Reminder audit log</h5>
              {reminderLog.length === 0 && <p className="muted small">No reminders sent yet.</p>}
              <ul>
                {reminderLog.map(r => (
                  <li key={r.id}><span>{r.driverName} ({r.licenseNumber})</span><span className="muted small">{fmtDateTime(r.sentAt)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================== VEHICLES ============================== */
function VehiclesTab({ data, persist, role, notify }) {
  const editable = canEdit("vehicles", role);
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fRegion, setFRegion] = useState("All");
  const [sort, setSort] = useState({ field: "regNumber", dir: "asc" });
  const [modal, setModal] = useState(null); // {mode:'new'|'edit', vehicle}
  const [docModal, setDocModal] = useState(null);

  const typeOptions = [...new Set(data.vehicles.map(v => v.type))];
  const statusOptions = ["Available", "On Trip", "In Shop", "Retired"];
  const regionOptions = [...new Set(data.vehicles.map(v => v.region))];

  const rows = sortRows(
    data.vehicles.filter(v =>
      [v.regNumber, v.name, v.type, v.region].join(" ").toLowerCase().includes(q.toLowerCase()) &&
      (fType === "All" || v.type === fType) &&
      (fStatus === "All" || v.status === fStatus) &&
      (fRegion === "All" || v.region === fRegion)
    ),
    sort
  );

  const save = (vehicle) => {
    const exists = data.vehicles.some(v => v.regNumber.toLowerCase() === vehicle.regNumber.toLowerCase() && v.id !== vehicle.id);
    if (exists) { notify("Registration number must be unique.", "err"); return false; }
    const list = data.vehicles.some(v => v.id === vehicle.id)
      ? data.vehicles.map(v => v.id === vehicle.id ? vehicle : v)
      : [...data.vehicles, vehicle];
    persist({ ...data, vehicles: list });
    notify("Vehicle saved.");
    return true;
  };

  const remove = (id) => {
    if (!confirm("Retire this vehicle instead of deleting is recommended. Delete permanently?")) return;
    persist({ ...data, vehicles: data.vehicles.filter(v => v.id !== id) });
    notify("Vehicle removed.");
  };

  return (
    <div>
      <Toolbar
        q={q} setQ={setQ} placeholder="Search reg. number, model, type, region…"
        filters={[
          { label: "Type", value: fType, onChange: setFType, options: typeOptions },
          { label: "Status", value: fStatus, onChange: setFStatus, options: statusOptions },
          { label: "Region", value: fRegion, onChange: setFRegion, options: regionOptions },
        ]}
        onAdd={editable ? () => setModal({ mode: "new", vehicle: blankVehicle() }) : null}
        addLabel="Add Vehicle"
        onExport={() => exportCSV("vehicles.csv", rows, vehicleColumns)}
      />
      <table className="table">
        <thead><tr>
          <SortHeader label="Reg. No" field="regNumber" sort={sort} setSort={setSort} />
          <SortHeader label="Model" field="name" sort={sort} setSort={setSort} />
          <SortHeader label="Type" field="type" sort={sort} setSort={setSort} />
          <SortHeader label="Capacity (kg)" field="maxCapacity" sort={sort} setSort={setSort} />
          <SortHeader label="Odometer" field="odometer" sort={sort} setSort={setSort} />
          <SortHeader label="Region" field="region" sort={sort} setSort={setSort} />
          <SortHeader label="Status" field="status" sort={sort} setSort={setSort} />
          <th>Docs</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map(v => (
            <tr key={v.id}>
              <td className="mono" data-label="Reg. No">{v.regNumber}</td>
              <td data-label="Model">{v.name}</td>
              <td data-label="Type">{v.type}</td>
              <td className="mono" data-label="Capacity (kg)">{v.maxCapacity}</td>
              <td className="mono" data-label="Odometer">{v.odometer.toLocaleString()}</td>
              <td data-label="Region">{v.region}</td>
              <td data-label="Status"><Pill status={v.status} /></td>
              <td data-label="Docs"><button className="link-btn" onClick={() => setDocModal(v)}><FileText size={13} /> {v.documents?.length || 0}</button></td>
              <td className="row-actions" data-label="Actions">
                {editable && <button className="icon-btn" onClick={() => setModal({ mode: "edit", vehicle: v })}><Edit3 size={14} /></button>}
                {editable && <button className="icon-btn" onClick={() => remove(v.id)}><Trash2 size={14} /></button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="empty">No vehicles match your search.</td></tr>}
        </tbody>
      </table>

      {modal && (
        <VehicleForm initial={modal.vehicle} onClose={() => setModal(null)} onSave={(v) => { if (save(v)) setModal(null); }} />
      )}
      {docModal && (
        <Modal title={`Documents — ${docModal.regNumber}`} onClose={() => setDocModal(null)}>
          <DocManager vehicle={docModal} editable={editable} notify={notify} onChange={(docs) => {
            const updated = { ...docModal, documents: docs };
            setDocModal(updated);
            persist({ ...data, vehicles: data.vehicles.map(v => v.id === updated.id ? updated : v) });
          }} />
        </Modal>
      )}
    </div>
  );
}

const vehicleColumns = [
  { key: "regNumber", label: "Reg No" }, { key: "name", label: "Model" }, { key: "type", label: "Type" },
  { key: "maxCapacity", label: "Capacity(kg)" }, { key: "odometer", label: "Odometer" },
  { key: "acquisitionCost", label: "Acquisition Cost" }, { key: "region", label: "Region" }, { key: "status", label: "Status" },
];

function blankVehicle() {
  return { id: uid("V"), regNumber: "", name: "", type: "Van", maxCapacity: 500, odometer: 0, acquisitionCost: 0, status: "Available", region: "North", documents: [] };
}

function VehicleForm({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title={initial.regNumber ? "Edit Vehicle" : "Add Vehicle"} onClose={onClose}>
      <div className="form-grid">
        <Field label="Registration Number"><input value={f.regNumber} onChange={e => set("regNumber", e.target.value)} /></Field>
        <Field label="Model / Name"><input value={f.name} onChange={e => set("name", e.target.value)} /></Field>
        <Field label="Type">
          <select value={f.type} onChange={e => set("type", e.target.value)}>
            {["Van", "Truck", "Bike", "Bus"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Max Load Capacity (kg)"><input type="number" value={f.maxCapacity} onChange={e => set("maxCapacity", +e.target.value)} /></Field>
        <Field label="Odometer (km)"><input type="number" value={f.odometer} onChange={e => set("odometer", +e.target.value)} /></Field>
        <Field label="Acquisition Cost (₹)"><input type="number" value={f.acquisitionCost} onChange={e => set("acquisitionCost", +e.target.value)} /></Field>
        <Field label="Region">
          <select value={f.region} onChange={e => set("region", e.target.value)}>
            {["North", "South", "East", "West", "Central"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={e => set("status", e.target.value)}>
            {["Available", "On Trip", "In Shop", "Retired"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(f)} disabled={!f.regNumber || !f.name}>Save vehicle</button>
      </div>
    </Modal>
  );
}

function DocManager({ vehicle, editable, onChange, notify }) {
  const [name, setName] = useState(""); const [note, setNote] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);
  const docs = vehicle.documents || [];

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { notify && notify("File is larger than 4MB — please attach a smaller file.", "err"); e.target.value = ""; return; }
    setPendingFile(file);
    if (!name) setName(file.name);
  };

  const add = async () => {
    if (!name) return;
    setBusy(true);
    try {
      let fileMeta = {};
      if (pendingFile) {
        fileMeta = await uploadDocument(vehicle.id, pendingFile);
        if (fileMeta.storage === "local" && isSupabaseConfigured) {
          notify && notify("Cloud upload failed — file was stored locally instead.", "err");
        }
      }
      onChange([...docs, { id: uid("d"), name, note, date: todayISO(), ...fileMeta }]);
      setName(""); setNote(""); setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally { setBusy(false); }
  };
  const del = (id) => onChange(docs.filter(d => d.id !== id));

  return (
    <div>
      <ul className="doc-list">
        {docs.map(d => (
          <li key={d.id}>
            <FileText size={13} />
            <div>
              <div>{d.name}</div>
              <div className="muted small">
                {d.note}{d.note ? " · " : ""}added {fmtDate(d.date)}
                {(d.fileUrl || d.fileData) ? <> · <a className="link-btn" style={{ display: "inline-flex" }} href={d.fileUrl || d.fileData} download={d.fileName} target="_blank" rel="noreferrer"><Paperclip size={11} /> {d.fileName}{d.storage === "supabase" && <span className="cloud-tag"> · cloud</span>}</a></> : <span> · no file attached</span>}
              </div>
            </div>
            {editable && <button className="icon-btn" onClick={() => del(d.id)}><Trash2 size={13} /></button>}
          </li>
        ))}
        {docs.length === 0 && <p className="muted">No documents on file.</p>}
      </ul>
      {editable && (
        <div className="doc-add-form">
          <div className="inline-form">
            <input placeholder="Document name" value={name} onChange={e => setName(e.target.value)} />
            <input placeholder="Note" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="inline-form">
            <label className="file-picker">
              <Upload size={13} /> {pendingFile ? pendingFile.name : "Attach file (PDF/image, max 4MB)"}
              <input ref={fileInputRef} type="file" accept=".pdf,image/*" onChange={onPickFile} style={{ display: "none" }} />
            </label>
            <button className="btn btn-primary" onClick={add} disabled={!name || busy}>{busy ? "Saving…" : <><Plus size={14} /> Add</>}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== DRIVERS ============================== */
function DriversTab({ data, persist, role, notify }) {
  const editable = canEdit("drivers", role);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("All");
  const [fCategory, setFCategory] = useState("All");
  const [sort, setSort] = useState({ field: "name", dir: "asc" });
  const [modal, setModal] = useState(null);

  const statusOptions = ["Available", "On Trip", "Off Duty", "Suspended"];
  const categoryOptions = [...new Set(data.drivers.map(d => d.licenseCategory))];

  const rows = sortRows(
    data.drivers.filter(d =>
      [d.name, d.email, d.licenseNumber, d.licenseCategory].join(" ").toLowerCase().includes(q.toLowerCase()) &&
      (fStatus === "All" || d.status === fStatus) &&
      (fCategory === "All" || d.licenseCategory === fCategory)
    ),
    sort
  );

  const save = (driver) => {
    const list = data.drivers.some(d => d.id === driver.id) ? data.drivers.map(d => d.id === driver.id ? driver : d) : [...data.drivers, driver];
    persist({ ...data, drivers: list });
    notify("Driver saved.");
  };
  const remove = (id) => { if (confirm("Remove this driver?")) { persist({ ...data, drivers: data.drivers.filter(d => d.id !== id) }); notify("Driver removed."); } };

  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder="Search name, email, license…"
        filters={[
          { label: "Status", value: fStatus, onChange: setFStatus, options: statusOptions },
          { label: "Category", value: fCategory, onChange: setFCategory, options: categoryOptions },
        ]}
        onAdd={editable ? () => setModal(blankDriver()) : null} addLabel="Add Driver"
        onExport={() => exportCSV("drivers.csv", rows, driverColumns)} />
      <table className="table">
        <thead><tr>
          <SortHeader label="Name" field="name" sort={sort} setSort={setSort} />
          <SortHeader label="Email" field="email" sort={sort} setSort={setSort} />
          <SortHeader label="License No" field="licenseNumber" sort={sort} setSort={setSort} />
          <th>Category</th>
          <SortHeader label="Expiry" field="licenseExpiry" sort={sort} setSort={setSort} />
          <th>Contact</th>
          <SortHeader label="Safety Score" field="safetyScore" sort={sort} setSort={setSort} />
          <SortHeader label="Status" field="status" sort={sort} setSort={setSort} />
          <th></th>
        </tr></thead>
        <tbody>
          {rows.map(d => {
            const days = daysUntil(d.licenseExpiry);
            return (
              <tr key={d.id}>
                <td data-label="Name">{d.name}</td>
                <td className="mono small" data-label="Email">{d.email || <span className="muted">—</span>}</td>
                <td className="mono" data-label="License No">{d.licenseNumber}</td>
                <td data-label="Category">{d.licenseCategory}</td>
                <td data-label="Expiry" className={days < 0 ? "danger-text" : days <= 30 ? "warn-text" : ""}>{fmtDate(d.licenseExpiry)}</td>
                <td className="mono" data-label="Contact">{d.contact}</td>
                <td className="mono" data-label="Safety Score">{d.safetyScore}</td>
                <td data-label="Status"><Pill status={d.status} /></td>
                <td className="row-actions" data-label="Actions">{editable && <button className="icon-btn" onClick={() => setModal(d)}><Edit3 size={14} /></button>}
                {editable && <button className="icon-btn" onClick={() => remove(d.id)}><Trash2 size={14} /></button>}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={9} className="empty">No drivers match your search.</td></tr>}
        </tbody>
      </table>
      {modal && <DriverForm initial={modal} onClose={() => setModal(null)} onSave={(d) => { save(d); setModal(null); }} />}
    </div>
  );
}

const driverColumns = [
  { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "licenseNumber", label: "License No" }, { key: "licenseCategory", label: "Category" },
  { key: "licenseExpiry", label: "Expiry" }, { key: "contact", label: "Contact" }, { key: "safetyScore", label: "Safety Score" }, { key: "status", label: "Status" },
];

function blankDriver() {
  return { id: uid("D"), name: "", email: "", licenseNumber: "", licenseCategory: "LMV", licenseExpiry: todayISO(), contact: "", safetyScore: 100, status: "Available" };
}

function DriverForm({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title={initial.name ? "Edit Driver" : "Add Driver"} onClose={onClose}>
      <div className="form-grid">
        <Field label="Name"><input value={f.name} onChange={e => set("name", e.target.value)} /></Field>
        <Field label="Email"><input type="email" value={f.email || ""} onChange={e => set("email", e.target.value)} placeholder="driver@example.com" /></Field>
        <Field label="License Number"><input value={f.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} /></Field>
        <Field label="License Category">
          <select value={f.licenseCategory} onChange={e => set("licenseCategory", e.target.value)}>
            {["LMV", "HMV", "MC"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="License Expiry"><input type="date" value={f.licenseExpiry} onChange={e => set("licenseExpiry", e.target.value)} /></Field>
        <Field label="Contact Number"><input value={f.contact} onChange={e => set("contact", e.target.value)} /></Field>
        <Field label="Safety Score (0-100)"><input type="number" min={0} max={100} value={f.safetyScore} onChange={e => set("safetyScore", +e.target.value)} /></Field>
        <Field label="Status">
          <select value={f.status} onChange={e => set("status", e.target.value)}>
            {["Available", "On Trip", "Off Duty", "Suspended"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(f)} disabled={!f.name || !f.licenseNumber}>Save driver</button>
      </div>
    </Modal>
  );
}

/* ============================== TRIPS ============================== */
function TripsTab({ data, persist, role, notify }) {
  const editable = canEdit("trips", role);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("All");
  const [sort, setSort] = useState({ field: "createdAt", dir: "desc" });
  const [modal, setModal] = useState(null);
  const [completeModal, setCompleteModal] = useState(null);

  const vMap = Object.fromEntries(data.vehicles.map(v => [v.id, v]));
  const dMap = Object.fromEntries(data.drivers.map(d => [d.id, d]));
  const statusOptions = ["Draft", "Dispatched", "Completed", "Cancelled"];

  const rows = sortRows(
    data.trips.filter(t =>
      [t.source, t.destination, vMap[t.vehicleId]?.regNumber, dMap[t.driverId]?.name].join(" ").toLowerCase().includes(q.toLowerCase()) &&
      (fStatus === "All" || t.status === fStatus)
    ),
    sort
  );

  const updateTrip = (trip, vPatch, dPatch) => {
    persist({
      ...data,
      trips: data.trips.map(t => t.id === trip.id ? trip : t),
      vehicles: vPatch ? data.vehicles.map(v => v.id === trip.vehicleId ? { ...v, ...vPatch } : v) : data.vehicles,
      drivers: dPatch ? data.drivers.map(d => d.id === trip.driverId ? { ...d, ...dPatch } : d) : data.drivers,
    });
  };

  const dispatch = (trip) => {
    updateTrip({ ...trip, status: "Dispatched", dispatchedAt: todayISO() }, { status: "On Trip" }, { status: "On Trip" });
    notify("Trip dispatched — vehicle & driver marked On Trip.");
  };

  const cancel = (trip) => {
    const wasDispatched = trip.status === "Dispatched";
    updateTrip(
      { ...trip, status: "Cancelled" },
      wasDispatched ? { status: "Available" } : null,
      wasDispatched ? { status: "Available" } : null
    );
    notify("Trip cancelled.");
  };

  const complete = (trip, { actualDistance, fuelConsumed, revenue }) => {
    const vehicle = vMap[trip.vehicleId];
    const updatedTrip = { ...trip, status: "Completed", completedAt: todayISO(), actualDistance, fuelConsumed, revenue };
    const nextVehicles = data.vehicles.map(v => v.id === trip.vehicleId ? { ...v, status: "Available", odometer: v.odometer + Number(actualDistance || 0) } : v);
    const nextDrivers = data.drivers.map(d => d.id === trip.driverId ? { ...d, status: "Available" } : d);
    const fuelEntry = fuelConsumed > 0 ? [{ id: uid("F"), vehicleId: trip.vehicleId, liters: Number(fuelConsumed), cost: Math.round(Number(fuelConsumed) * 100), date: todayISO(), tripId: trip.id }] : [];
    persist({
      ...data,
      trips: data.trips.map(t => t.id === trip.id ? updatedTrip : t),
      vehicles: nextVehicles,
      drivers: nextDrivers,
      fuelLogs: [...data.fuelLogs, ...fuelEntry],
    });
    notify("Trip completed — vehicle & driver marked Available.");
    setCompleteModal(null);
  };

  const createTrip = (trip) => {
    const vehicle = vMap[trip.vehicleId];
    if (trip.cargoWeight > vehicle.maxCapacity) { notify(`Cargo weight exceeds ${vehicle.regNumber}'s max capacity of ${vehicle.maxCapacity}kg.`, "err"); return false; }
    persist({ ...data, trips: [...data.trips, trip] });
    notify("Trip created as Draft.");
    return true;
  };

  const remove = (id) => { if (confirm("Delete this trip record?")) { persist({ ...data, trips: data.trips.filter(t => t.id !== id) }); } };

  const availableVehicles = data.vehicles.filter(v => v.status === "Available");
  const availableDrivers = data.drivers.filter(d => d.status === "Available" && daysUntil(d.licenseExpiry) >= 0);

  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder="Search source, destination, vehicle, driver…"
        filters={[{ label: "Status", value: fStatus, onChange: setFStatus, options: statusOptions }]}
        onAdd={editable ? () => setModal(true) : null} addLabel="Create Trip"
        onExport={() => exportCSV("trips.csv", rows.map(t => ({ ...t, vehicle: vMap[t.vehicleId]?.regNumber, driver: dMap[t.driverId]?.name })),
          [{ key: "id", label: "Trip ID" }, { key: "source", label: "Source" }, { key: "destination", label: "Destination" },
           { key: "vehicle", label: "Vehicle" }, { key: "driver", label: "Driver" }, { key: "cargoWeight", label: "Cargo(kg)" },
           { key: "plannedDistance", label: "Planned Dist" }, { key: "actualDistance", label: "Actual Dist" }, { key: "status", label: "Status" }])} />

      <table className="table">
        <thead><tr>
          <th>Route</th><th>Vehicle</th><th>Driver</th>
          <SortHeader label="Cargo (kg)" field="cargoWeight" sort={sort} setSort={setSort} />
          <SortHeader label="Distance (km)" field="plannedDistance" sort={sort} setSort={setSort} />
          <SortHeader label="Status" field="status" sort={sort} setSort={setSort} />
          <th></th>
        </tr></thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.id}>
              <td data-label="Route"><MapPin size={12} style={{ opacity: .6 }} /> {t.source} → {t.destination}</td>
              <td className="mono" data-label="Vehicle">{vMap[t.vehicleId]?.regNumber || "—"}</td>
              <td data-label="Driver">{dMap[t.driverId]?.name || "—"}</td>
              <td className="mono" data-label="Cargo (kg)">{t.cargoWeight}</td>
              <td className="mono" data-label="Distance (km)">{t.actualDistance ?? t.plannedDistance}</td>
              <td data-label="Status"><Pill status={t.status} /></td>
              <td className="row-actions" data-label="Actions">
                {editable && t.status === "Draft" && <button className="btn btn-sm btn-primary" onClick={() => dispatch(t)}>Dispatch</button>}
                {editable && t.status === "Dispatched" && <button className="btn btn-sm btn-primary" onClick={() => setCompleteModal(t)}>Complete</button>}
                {editable && (t.status === "Draft" || t.status === "Dispatched") && <button className="btn btn-sm" onClick={() => cancel(t)}>Cancel</button>}
                {editable && <button className="icon-btn" onClick={() => remove(t.id)}><Trash2 size={14} /></button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="empty">No trips match your search.</td></tr>}
        </tbody>
      </table>

      {modal && (
        <TripForm vehicles={availableVehicles} drivers={availableDrivers} onClose={() => setModal(false)}
          onSave={(t) => { if (createTrip(t)) setModal(false); }} />
      )}
      {completeModal && (
        <CompleteTripModal trip={completeModal} vehicle={vMap[completeModal.vehicleId]} onClose={() => setCompleteModal(null)} onSubmit={(vals) => complete(completeModal, vals)} />
      )}
    </div>
  );
}

function TripForm({ vehicles, drivers, onClose, onSave }) {
  const [f, setF] = useState({ id: uid("T"), source: "", destination: "", vehicleId: vehicles[0]?.id || "", driverId: drivers[0]?.id || "", cargoWeight: 0, plannedDistance: 0, revenue: 0, status: "Draft", createdAt: todayISO() });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const vehicle = vehicles.find(v => v.id === f.vehicleId);
  const overCapacity = vehicle && f.cargoWeight > vehicle.maxCapacity;
  return (
    <Modal title="Create Trip" onClose={onClose}>
      <div className="form-grid">
        <Field label="Source"><input value={f.source} onChange={e => set("source", e.target.value)} /></Field>
        <Field label="Destination"><input value={f.destination} onChange={e => set("destination", e.target.value)} /></Field>
        <Field label="Vehicle (Available only)">
          <select value={f.vehicleId} onChange={e => set("vehicleId", e.target.value)}>
            {vehicles.length === 0 && <option value="">No available vehicles</option>}
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNumber} — {v.name} (max {v.maxCapacity}kg)</option>)}
          </select>
        </Field>
        <Field label="Driver (Available & licensed only)">
          <select value={f.driverId} onChange={e => set("driverId", e.target.value)}>
            {drivers.length === 0 && <option value="">No available drivers</option>}
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.licenseCategory}</option>)}
          </select>
        </Field>
        <Field label="Cargo Weight (kg)">
          <input type="number" value={f.cargoWeight} onChange={e => set("cargoWeight", +e.target.value)} />
        </Field>
        <Field label="Planned Distance (km)"><input type="number" value={f.plannedDistance} onChange={e => set("plannedDistance", +e.target.value)} /></Field>
      </div>
      {overCapacity && <div className="form-error"><AlertTriangle size={14} /> Cargo weight exceeds vehicle max capacity ({vehicle.maxCapacity}kg).</div>}
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.source || !f.destination || !f.vehicleId || !f.driverId || overCapacity} onClick={() => onSave(f)}>Create trip</button>
      </div>
    </Modal>
  );
}

function CompleteTripModal({ trip, vehicle, onClose, onSubmit }) {
  const [actualDistance, setAD] = useState(trip.plannedDistance);
  const [fuelConsumed, setFC] = useState(0);
  const [revenue, setRev] = useState(0);
  return (
    <Modal title={`Complete Trip — ${trip.source} → ${trip.destination}`} onClose={onClose}>
      <div className="form-grid">
        <Field label="Final Odometer Reading Added (km)"><input type="number" value={actualDistance} onChange={e => setAD(+e.target.value)} /></Field>
        <Field label="Fuel Consumed (liters)"><input type="number" value={fuelConsumed} onChange={e => setFC(+e.target.value)} /></Field>
        <Field label="Trip Revenue (₹)"><input type="number" value={revenue} onChange={e => setRev(+e.target.value)} /></Field>
      </div>
      <p className="muted small">Vehicle {vehicle?.regNumber} odometer will move from {vehicle?.odometer.toLocaleString()} km to {(vehicle?.odometer + Number(actualDistance || 0)).toLocaleString()} km.</p>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSubmit({ actualDistance, fuelConsumed, revenue })}>Mark completed</button>
      </div>
    </Modal>
  );
}

/* ============================== MAINTENANCE ============================== */
function MaintenanceTab({ data, persist, role, notify }) {
  const editable = canEdit("maintenance", role);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("All");
  const [fType, setFType] = useState("All");
  const [modal, setModal] = useState(null);
  const vMap = Object.fromEntries(data.vehicles.map(v => [v.id, v]));

  const statusOptions = ["Active", "Closed"];
  const typeOptions = [...new Set(data.maintenance.map(m => m.type))];

  const rows = data.maintenance.filter(m =>
    [m.type, vMap[m.vehicleId]?.regNumber].join(" ").toLowerCase().includes(q.toLowerCase()) &&
    (fStatus === "All" || m.status === fStatus) &&
    (fType === "All" || m.type === fType)
  );

  const createRecord = (rec) => {
    const vehicle = vMap[rec.vehicleId];
    if (vehicle.status === "On Trip") { notify("Vehicle is currently On Trip and cannot enter maintenance.", "err"); return false; }
    persist({
      ...data,
      maintenance: [...data.maintenance, rec],
      vehicles: rec.status === "Active" ? data.vehicles.map(v => v.id === rec.vehicleId ? { ...v, status: "In Shop" } : v) : data.vehicles,
    });
    notify("Maintenance record created. Vehicle marked In Shop.");
    return true;
  };

  const closeRecord = (rec) => {
    const vehicle = vMap[rec.vehicleId];
    persist({
      ...data,
      maintenance: data.maintenance.map(m => m.id === rec.id ? { ...m, status: "Closed" } : m),
      vehicles: data.vehicles.map(v => v.id === rec.vehicleId ? { ...v, status: vehicle.status === "Retired" ? "Retired" : "Available" } : v),
    });
    notify("Maintenance closed — vehicle restored.");
  };

  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder="Search type, vehicle…"
        filters={[
          { label: "Status", value: fStatus, onChange: setFStatus, options: statusOptions },
          { label: "Type", value: fType, onChange: setFType, options: typeOptions },
        ]}
        onAdd={editable ? () => setModal(true) : null} addLabel="Log Maintenance"
        onExport={() => exportCSV("maintenance.csv", rows.map(m => ({ ...m, vehicle: vMap[m.vehicleId]?.regNumber })),
          [{ key: "vehicle", label: "Vehicle" }, { key: "type", label: "Type" }, { key: "cost", label: "Cost" }, { key: "date", label: "Date" }, { key: "status", label: "Status" }])} />
      <table className="table">
        <thead><tr><th>Vehicle</th><th>Type</th><th>Cost</th><th>Date</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.id}>
              <td className="mono" data-label="Vehicle">{vMap[m.vehicleId]?.regNumber || "—"}</td>
              <td data-label="Type">{m.type}</td>
              <td className="mono" data-label="Cost">{money(m.cost)}</td>
              <td data-label="Date">{fmtDate(m.date)}</td>
              <td data-label="Status"><Pill status={m.status} /></td>
              <td className="row-actions" data-label="Actions">{editable && m.status === "Active" && <button className="btn btn-sm btn-primary" onClick={() => closeRecord(m)}>Close</button>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="empty">No maintenance records.</td></tr>}
        </tbody>
      </table>
      {modal && (
        <MaintenanceForm vehicles={data.vehicles.filter(v => v.status !== "Retired")} onClose={() => setModal(false)}
          onSave={(rec) => { if (createRecord(rec)) setModal(false); }} />
      )}
    </div>
  );
}

function MaintenanceForm({ vehicles, onClose, onSave }) {
  const [f, setF] = useState({ id: uid("M"), vehicleId: vehicles[0]?.id || "", type: "Oil Change", cost: 0, date: todayISO(), status: "Active", notes: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title="Log Maintenance" onClose={onClose}>
      <div className="form-grid">
        <Field label="Vehicle">
          <select value={f.vehicleId} onChange={e => set("vehicleId", e.target.value)}>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNumber} — {v.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={f.type} onChange={e => set("type", e.target.value)}>
            {["Oil Change", "Brake Repair", "Tire Replacement", "General Service", "Engine Repair", "Other"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Cost (₹)"><input type="number" value={f.cost} onChange={e => set("cost", +e.target.value)} /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
        <Field label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field>
      </div>
      <p className="muted small">Creating this record will mark the vehicle "In Shop" and remove it from dispatch selection.</p>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.vehicleId} onClick={() => onSave(f)}>Save record</button>
      </div>
    </Modal>
  );
}

/* ============================== FUEL & EXPENSES ============================== */
function FuelTab({ data, persist, role, notify }) {
  const editable = canEdit("fuel", role);
  const [subtab, setSubtab] = useState("fuel");
  const [fuelModal, setFuelModal] = useState(false);
  const [expModal, setExpModal] = useState(false);
  const [qFuel, setQFuel] = useState("");
  const [fFuelVehicle, setFFuelVehicle] = useState("All");
  const [qExp, setQExp] = useState("");
  const [fExpVehicle, setFExpVehicle] = useState("All");
  const [fExpCategory, setFExpCategory] = useState("All");
  const vMap = Object.fromEntries(data.vehicles.map(v => [v.id, v]));
  const vehicleOptions = data.vehicles.map(v => v.regNumber);
  const categoryOptions = [...new Set(data.expenses.map(e => e.category))];

  const addFuel = (rec) => { persist({ ...data, fuelLogs: [...data.fuelLogs, rec] }); notify("Fuel log added."); setFuelModal(false); };
  const addExpense = (rec) => { persist({ ...data, expenses: [...data.expenses, rec] }); notify("Expense recorded."); setExpModal(false); };

  const fuelRows = data.fuelLogs.filter(f => {
    const reg = vMap[f.vehicleId]?.regNumber || "";
    return reg.toLowerCase().includes(qFuel.toLowerCase()) && (fFuelVehicle === "All" || reg === fFuelVehicle);
  });
  const expenseRows = data.expenses.filter(e => {
    const reg = vMap[e.vehicleId]?.regNumber || "";
    return [reg, e.category, e.note].join(" ").toLowerCase().includes(qExp.toLowerCase()) &&
      (fExpVehicle === "All" || reg === fExpVehicle) &&
      (fExpCategory === "All" || e.category === fExpCategory);
  });

  return (
    <div>
      <div className="subtabs">
        <button className={subtab === "fuel" ? "active" : ""} onClick={() => setSubtab("fuel")}>Fuel Logs</button>
        <button className={subtab === "expenses" ? "active" : ""} onClick={() => setSubtab("expenses")}>Other Expenses</button>
      </div>

      {subtab === "fuel" && (
        <div>
          <Toolbar q={qFuel} setQ={setQFuel} placeholder="Search vehicle reg. number…"
            filters={[{ label: "Vehicle", value: fFuelVehicle, onChange: setFFuelVehicle, options: vehicleOptions }]}
            onAdd={editable ? () => setFuelModal(true) : null} addLabel="Add Fuel Log"
            onExport={() => exportCSV("fuel-logs.csv", fuelRows.map(f => ({ ...f, vehicle: vMap[f.vehicleId]?.regNumber })),
              [{ key: "vehicle", label: "Vehicle" }, { key: "liters", label: "Liters" }, { key: "cost", label: "Cost" }, { key: "date", label: "Date" }])} />
          <table className="table">
            <thead><tr><th>Vehicle</th><th>Liters</th><th>Cost</th><th>Date</th><th>Trip</th></tr></thead>
            <tbody>
              {fuelRows.map(f => (
                <tr key={f.id}><td className="mono" data-label="Vehicle">{vMap[f.vehicleId]?.regNumber}</td><td className="mono" data-label="Liters">{f.liters}</td><td className="mono" data-label="Cost">{money(f.cost)}</td><td data-label="Date">{fmtDate(f.date)}</td><td data-label="Trip">{f.tripId || "—"}</td></tr>
              ))}
              {fuelRows.length === 0 && <tr><td colSpan={5} className="empty">No fuel logs match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {subtab === "expenses" && (
        <div>
          <Toolbar q={qExp} setQ={setQExp} placeholder="Search vehicle, category, note…"
            filters={[
              { label: "Vehicle", value: fExpVehicle, onChange: setFExpVehicle, options: vehicleOptions },
              { label: "Category", value: fExpCategory, onChange: setFExpCategory, options: categoryOptions },
            ]}
            onAdd={editable ? () => setExpModal(true) : null} addLabel="Add Expense"
            onExport={() => exportCSV("expenses.csv", expenseRows.map(e => ({ ...e, vehicle: vMap[e.vehicleId]?.regNumber })),
              [{ key: "vehicle", label: "Vehicle" }, { key: "category", label: "Category" }, { key: "amount", label: "Amount" }, { key: "date", label: "Date" }, { key: "note", label: "Note" }])} />
          <table className="table">
            <thead><tr><th>Vehicle</th><th>Category</th><th>Amount</th><th>Date</th><th>Note</th></tr></thead>
            <tbody>
              {expenseRows.map(e => (
                <tr key={e.id}><td className="mono" data-label="Vehicle">{vMap[e.vehicleId]?.regNumber}</td><td data-label="Category">{e.category}</td><td className="mono" data-label="Amount">{money(e.amount)}</td><td data-label="Date">{fmtDate(e.date)}</td><td data-label="Note">{e.note}</td></tr>
              ))}
              {expenseRows.length === 0 && <tr><td colSpan={5} className="empty">No expenses match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {fuelModal && <FuelForm vehicles={data.vehicles} onClose={() => setFuelModal(false)} onSave={addFuel} />}
      {expModal && <ExpenseForm vehicles={data.vehicles} onClose={() => setExpModal(false)} onSave={addExpense} />}
    </div>
  );
}

function FuelForm({ vehicles, onClose, onSave }) {
  const [f, setF] = useState({ id: uid("F"), vehicleId: vehicles[0]?.id || "", liters: 0, cost: 0, date: todayISO(), tripId: null });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title="Add Fuel Log" onClose={onClose}>
      <div className="form-grid">
        <Field label="Vehicle"><select value={f.vehicleId} onChange={e => set("vehicleId", e.target.value)}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.regNumber}</option>)}</select></Field>
        <Field label="Liters"><input type="number" value={f.liters} onChange={e => set("liters", +e.target.value)} /></Field>
        <Field label="Cost (₹)"><input type="number" value={f.cost} onChange={e => set("cost", +e.target.value)} /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
      </div>
      <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(f)}>Save</button></div>
    </Modal>
  );
}

function ExpenseForm({ vehicles, onClose, onSave }) {
  const [f, setF] = useState({ id: uid("E"), vehicleId: vehicles[0]?.id || "", category: "Toll", amount: 0, date: todayISO(), note: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title="Add Expense" onClose={onClose}>
      <div className="form-grid">
        <Field label="Vehicle"><select value={f.vehicleId} onChange={e => set("vehicleId", e.target.value)}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.regNumber}</option>)}</select></Field>
        <Field label="Category">
          <select value={f.category} onChange={e => set("category", e.target.value)}>{["Toll", "Parking", "Fine", "Permit", "Other"].map(t => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Amount (₹)"><input type="number" value={f.amount} onChange={e => set("amount", +e.target.value)} /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
        <Field label="Note"><input value={f.note} onChange={e => set("note", e.target.value)} /></Field>
      </div>
      <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(f)}>Save</button></div>
    </Modal>
  );
}

/* ============================== REPORTS ============================== */
function ReportsTab({ data, notify }) {
  const [generating, setGenerating] = useState(false);
  const perVehicle = data.vehicles.map(v => {
    const fuel = data.fuelLogs.filter(f => f.vehicleId === v.id);
    const maint = data.maintenance.filter(m => m.vehicleId === v.id);
    const exp = data.expenses.filter(e => e.vehicleId === v.id);
    const trips = data.trips.filter(t => t.vehicleId === v.id && t.status === "Completed");
    const totalFuelCost = fuel.reduce((s, f) => s + f.cost, 0);
    const totalMaintCost = maint.reduce((s, m) => s + m.cost, 0);
    const totalExpCost = exp.reduce((s, e) => s + e.amount, 0);
    const totalLiters = fuel.reduce((s, f) => s + f.liters, 0);
    const totalDistance = trips.reduce((s, t) => s + (t.actualDistance || 0), 0);
    const revenue = trips.reduce((s, t) => s + (t.revenue || 0), 0);
    const operationalCost = totalFuelCost + totalMaintCost;
    const roi = v.acquisitionCost ? ((revenue - operationalCost) / v.acquisitionCost) * 100 : 0;
    const fuelEfficiency = totalLiters ? (totalDistance / totalLiters) : 0;
    return { ...v, totalFuelCost, totalMaintCost, totalExpCost, operationalCost: operationalCost + totalExpCost, totalDistance, totalLiters, revenue, roi, fuelEfficiency };
  });

  const activeVehicles = data.vehicles.filter(v => v.status !== "Retired").length;
  const onTrip = data.vehicles.filter(v => v.status === "On Trip").length;
  const utilization = activeVehicles ? Math.round((onTrip / activeVehicles) * 100) : 0;

  const costChart = perVehicle.map(v => ({ name: v.regNumber, Fuel: v.totalFuelCost, Maintenance: v.totalMaintCost, Expenses: v.totalExpCost }));
  const effChart = perVehicle.filter(v => v.totalLiters > 0).map(v => ({ name: v.regNumber, "km/L": +v.fuelEfficiency.toFixed(2) }));

  const exportPDF = async () => {
    setGenerating(true);
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });

      doc.setFontSize(18); doc.setTextColor(20, 20, 20);
      doc.text("TransitOps — Fleet Operations Report", 40, 46);
      doc.setFontSize(10); doc.setTextColor(110, 110, 110);
      doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, 40, 62);

      doc.setFontSize(12); doc.setTextColor(20, 20, 20);
      doc.text(`Fleet Utilization: ${utilization}%   |   Active Vehicles: ${activeVehicles}   |   On Trip: ${onTrip}`, 40, 84);

      doc.autoTable({
        startY: 100,
        head: [["Vehicle", "Type", "Fuel Eff. (km/L)", "Operational Cost", "Revenue", "ROI %"]],
        body: perVehicle.map(v => [
          v.regNumber, v.type,
          v.totalLiters ? v.fuelEfficiency.toFixed(2) : "—",
          money(v.operationalCost), money(v.revenue), v.roi.toFixed(1) + "%"
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [34, 184, 176] },
        margin: { left: 40, right: 40 },
      });

      let y = doc.lastAutoTable.finalY + 24;
      doc.setFontSize(12); doc.text("Cost Breakdown by Vehicle", 40, y);
      doc.autoTable({
        startY: y + 10,
        head: [["Vehicle", "Fuel Cost", "Maintenance Cost", "Other Expenses"]],
        body: costChart.map(c => [c.name, money(c.Fuel), money(c.Maintenance), money(c.Expenses)]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [255, 176, 32] },
        margin: { left: 40, right: 40 },
      });

      doc.save(`transitops-report-${todayISO()}.pdf`);
      notify && notify("PDF report downloaded.");
    } catch (err) {
      notify && notify("Could not generate PDF — check your connection and try again.", "err");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="report-head">
        <div>
          <h4>Fleet Utilization</h4>
          <div className="big-number">{utilization}%</div>
        </div>
        <div className="report-actions">
          <button className="btn" onClick={() => exportCSV("reports.csv", perVehicle,
            [{ key: "regNumber", label: "Vehicle" }, { key: "fuelEfficiency", label: "Fuel Efficiency (km/L)", get: r => r.fuelEfficiency.toFixed(2) },
             { key: "operationalCost", label: "Operational Cost" }, { key: "revenue", label: "Revenue" }, { key: "roi", label: "ROI %", get: r => r.roi.toFixed(1) }])}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={exportPDF} disabled={generating}>
            <Printer size={14} /> {generating ? "Generating PDF…" : "Export PDF"}
          </button>
        </div>
      </div>

      <RouteDivider label="Cost breakdown by vehicle" />
      <div className="panel">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={costChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--border)" }} />
            <Legend />
            <Bar dataKey="Fuel" stackId="a" fill="var(--teal)" />
            <Bar dataKey="Maintenance" stackId="a" fill="var(--amber)" />
            <Bar dataKey="Expenses" stackId="a" fill="var(--red)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <RouteDivider label="Fuel efficiency (km per liter)" />
      <div className="panel">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={effChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--border)" }} />
            <Line type="monotone" dataKey="km/L" stroke="var(--green)" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <RouteDivider label="Per-vehicle profitability" />
      <table className="table">
        <thead><tr><th>Vehicle</th><th>Fuel Eff. (km/L)</th><th>Operational Cost</th><th>Revenue</th><th>ROI</th></tr></thead>
        <tbody>
          {perVehicle.map(v => (
            <tr key={v.id}>
              <td className="mono" data-label="Vehicle">{v.regNumber}</td>
              <td className="mono" data-label="Fuel Eff. (km/L)">{v.totalLiters ? v.fuelEfficiency.toFixed(2) : "—"}</td>
              <td className="mono" data-label="Operational Cost">{money(v.operationalCost)}</td>
              <td className="mono" data-label="Revenue">{money(v.revenue)}</td>
              <td className={"mono " + (v.roi >= 0 ? "" : "danger-text")} data-label="ROI">{v.roi.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================== SHARED TOOLBAR ============================== */
function Toolbar({ q, setQ, placeholder, onAdd, addLabel, onExport, hideSearch, filters }) {
  return (
    <div className="toolbar">
      {!hideSearch && (
        <div className="search-box">
          <Search size={14} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} />
        </div>
      )}
      {filters && filters.length > 0 && (
        <div className="filter-chips">
          {filters.map((f, i) => (
            <select key={i} value={f.value} onChange={e => f.onChange(e.target.value)} title={f.label}>
              <option value="All">{f.label}: All</option>
              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
        </div>
      )}
      <div className="toolbar-spacer" />
      {onExport && <button className="btn" onClick={onExport}><Download size={14} /> Export CSV</button>}
      {onAdd && <button className="btn btn-primary" onClick={onAdd}><Plus size={14} /> {addLabel}</button>}
    </div>
  );
}

/* ============================== STYLES ============================== */
function StyleSheet() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      .app-root {
        font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
        background: var(--bg); color: var(--text); min-height: 640px;
        display: flex; width: 100%; border-radius: 10px; overflow: hidden;
        border: 1px solid var(--border);
      }
      input, select, button { font-family: inherit; }
      h1,h2,h3,h4 { font-family: 'IBM Plex Sans', sans-serif; font-weight: 600; margin: 0 0 10px; }
      .mono { font-family: 'IBM Plex Mono', 'Courier New', monospace; font-size: 12.5px; }

      /* ---- Sidebar ---- */
      .sidebar { width: 208px; background: var(--bg-elev); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 16px 12px; flex-shrink: 0; transition: transform .2s ease; }
      .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; letter-spacing: .2px; padding: 4px 8px 18px; }
      .mobile-close { display: none; margin-left: auto; }
      .mobile-scrim { display: none; }
      .sidebar nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
      .nav-item { display: flex; align-items: center; gap: 9px; padding: 9px 10px; border-radius: 7px; border: none; background: transparent; color: var(--text-dim); font-size: 13px; cursor: pointer; text-align: left; width: 100%; transition: background .12s, color .12s; }
      .nav-item:hover { background: var(--bg-elev2); color: var(--text); }
      .nav-item.active { background: var(--bg-elev2); color: var(--amber); font-weight: 600; }
      .sidebar-foot { border-top: 1px solid var(--border); padding-top: 12px; margin-top: 8px; }
      .user-chip { display: flex; align-items: center; gap: 8px; padding: 6px 8px 12px; }
      .avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--teal); color: #04201F; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
      .user-name { font-size: 12.5px; font-weight: 600; }
      .user-role { font-size: 11px; color: var(--text-dim); }

      /* ---- Main ---- */
      .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 22px; border-bottom: 1px solid var(--border); }
      .topbar-left { display: flex; align-items: center; gap: 10px; }
      .backend-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; padding: 5px 10px; border-radius: 20px; border: 1px solid var(--border); color: var(--text-dim); white-space: nowrap; }
      .backend-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-dim); }
      .backend-badge.ok { color: var(--green); border-color: var(--green); }
      .backend-badge.ok .dot { background: var(--green); }
      .backend-badge.warn { color: var(--amber); border-color: var(--amber); }
      .backend-badge.warn .dot { background: var(--amber); }
      .cloud-tag { color: var(--teal); }
      .mobile-menu-btn { display: none; }
      .topbar-title { font-size: 16px; font-weight: 700; }
      .content { padding: 20px 22px 40px; overflow-y: auto; }

      /* ---- Route divider (signature element) ---- */
      .route-divider { margin: 22px 0 14px; }
      .route-label { font-size: 11px; text-transform: uppercase; letter-spacing: .09em; color: var(--text-dim); display: block; margin-bottom: 6px; }
      .route-line { position: relative; height: 1px; background-image: linear-gradient(to right, var(--border) 60%, transparent 0%); background-size: 10px 1px; background-repeat: repeat-x; }
      .route-marker { position: absolute; right: 0; top: -8px; color: var(--amber); font-size: 12px; animation: driftIn .6s ease-out; }
      @keyframes driftIn { from { transform: translateX(-16px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

      /* ---- Stat cards ---- */
      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; }
      .stat-card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 9px; padding: 12px 14px; }
      .stat-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .stat-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .05em; }
      .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; }

      .filter-row { display: flex; gap: 8px; margin-bottom: 4px; }
      .filter-row select { background: var(--bg-elev); border: 1px solid var(--border); color: var(--text); padding: 7px 10px; border-radius: 7px; font-size: 12.5px; }

      .grid-2 { display: grid; grid-template-columns: 1.1fr .9fr; gap: 14px; margin-top: 8px; }
      .panel { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 9px; padding: 14px 16px; }
      .muted { color: var(--text-dim); font-size: 12.5px; }
      .small { font-size: 11px; }

      .reminder-list { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; }
      .reminder-list li { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12px; padding: 7px 9px; border-radius: 6px; background: var(--bg-elev2); }
      .reminder-list li.danger { border-left: 3px solid var(--red); }
      .reminder-list li.warn { border-left: 3px solid var(--amber); }
      .panel-head-row { display: flex; align-items: center; justify-content: space-between; }
      .panel-head-row h4 { margin: 0; }
      .disclaimer { background: var(--bg-elev2); border: 1px dashed var(--border); border-radius: 7px; padding: 8px 10px; margin: 6px 0 10px; }
      .reminder-log { margin-top: 14px; border-top: 1px solid var(--border); padding-top: 10px; }
      .reminder-log h5 { margin: 0 0 8px; font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .05em; }
      .reminder-log ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; max-height: 160px; overflow-y: auto; }
      .reminder-log li { display: flex; justify-content: space-between; font-size: 12px; padding: 5px 8px; background: var(--bg-elev2); border-radius: 5px; }
      .doc-add-form { display: flex; flex-direction: column; gap: 8px; }
      .file-picker { display: flex; align-items: center; gap: 7px; flex: 1; background: var(--bg); border: 1px dashed var(--border); color: var(--text-dim); padding: 8px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
      .file-picker:hover { border-color: var(--teal); color: var(--text); }

      /* ---- Toolbar / search ---- */
      .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
      .toolbar-spacer { flex: 1; }
      .search-box { display: flex; align-items: center; gap: 7px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 7px; padding: 7px 10px; min-width: 240px; color: var(--text-dim); }
      .search-box input { background: transparent; border: none; outline: none; color: var(--text); font-size: 12.5px; width: 100%; }
      .filter-chips { display: flex; gap: 8px; flex-wrap: wrap; }
      .filter-chips select { background: var(--bg-elev); border: 1px solid var(--border); color: var(--text); padding: 7px 10px; border-radius: 7px; font-size: 12px; }

      .subtabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid var(--border); }
      .subtabs button { background: none; border: none; padding: 8px 14px; font-size: 12.5px; color: var(--text-dim); cursor: pointer; border-bottom: 2px solid transparent; }
      .subtabs button.active { color: var(--amber); border-bottom-color: var(--amber); font-weight: 600; }

      /* ---- Buttons ---- */
      .btn { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-elev2); border: 1px solid var(--border); color: var(--text); padding: 8px 13px; border-radius: 7px; font-size: 12.5px; cursor: pointer; }
      .btn:hover { border-color: var(--teal); }
      .btn-primary { background: var(--amber); color: #241800; border-color: var(--amber); font-weight: 600; }
      .btn-primary:hover { filter: brightness(1.06); }
      .btn-sm { padding: 5px 9px; font-size: 11.5px; }
      .btn:disabled { opacity: .5; cursor: not-allowed; }
      .icon-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 5px; border-radius: 6px; display: inline-flex; }
      .icon-btn:hover { background: var(--bg-elev2); color: var(--text); }
      .link-btn { background: none; border: none; color: var(--blue); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }

      /* ---- Table ---- */
      .table { width: 100%; border-collapse: collapse; font-size: 12.5px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }
      .table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--bg-elev2); user-select: none; }
      .th-sort { cursor: pointer; display: table-cell; }
      .table td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
      .table tr:last-child td { border-bottom: none; }
      .row-actions { display: flex; gap: 4px; align-items: center; white-space: nowrap; }
      .empty { text-align: center; color: var(--text-dim); padding: 26px !important; }
      .danger-text { color: var(--red); font-weight: 600; }
      .warn-text { color: var(--amber); font-weight: 600; }

      /* ---- Pills ---- */
      .pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 3px 9px; border-radius: 20px; border: 1px solid var(--pc); color: var(--pc); font-weight: 600; }
      .pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pc); }

      /* ---- Modal ---- */
      .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 50; }
      .modal { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 12px; width: 440px; max-width: 92vw; max-height: 86vh; overflow-y: auto; }
      .modal-wide { width: 600px; }
      .modal-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border); }
      .modal-head h3 { margin: 0; font-size: 15px; }
      .modal-body { padding: 16px 18px; }
      .modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .field { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: var(--text-dim); }
      .field input, .field select { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; border-radius: 6px; font-size: 12.5px; }
      .form-error { display: flex; align-items: center; gap: 6px; color: var(--red); font-size: 12px; margin-top: 10px; }

      .doc-list { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 8px; }
      .doc-list li { display: flex; align-items: center; gap: 8px; background: var(--bg-elev2); padding: 8px 10px; border-radius: 7px; }
      .doc-list li > div:nth-child(2) { flex: 1; font-size: 12.5px; }
      .inline-form { display: flex; gap: 6px; }
      .inline-form input { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 7px 9px; border-radius: 6px; font-size: 12px; }

      /* ---- Login ---- */
      .login-wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; min-height: 640px; }
      .login-card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 14px; padding: 30px 32px; width: 380px; max-width: 92vw; }
      .login-brand { display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 700; }
      .login-sub { color: var(--text-dim); font-size: 12.5px; margin: 4px 0 20px; }
      .login-form { display: flex; flex-direction: column; gap: 12px; }
      .login-form input { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 9px 11px; border-radius: 7px; font-size: 13px; }
      .login-hint { font-size: 11px; color: var(--text-dim); margin-top: 12px; }
      .demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
      .demo-chip { display: flex; align-items: center; gap: 5px; background: var(--bg-elev2); border: 1px solid var(--border); color: var(--text-dim); padding: 6px 9px; border-radius: 7px; font-size: 11px; cursor: pointer; }
      .demo-chip:hover { color: var(--teal); border-color: var(--teal); }

      /* ---- Reports ---- */
      .report-head { display: flex; justify-content: space-between; align-items: flex-end; }
      .big-number { font-family: 'IBM Plex Mono', monospace; font-size: 32px; font-weight: 700; color: var(--teal); }
      .report-actions { display: flex; gap: 8px; }

      /* ---- Toast ---- */
      .toast { position: fixed; bottom: 20px; right: 20px; background: var(--bg-elev2); border: 1px solid var(--border); padding: 10px 16px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; z-index: 60; }
      .toast-err { border-color: var(--red); color: var(--red); }

      .boot { display: flex; align-items: center; justify-content: center; gap: 10px; height: 400px; color: var(--text-dim); font-size: 13px; }

      @media (max-width: 860px) {
        .app-root { position: relative; overflow: hidden; }
        .sidebar {
          position: fixed; top: 0; left: 0; bottom: 0; width: 240px; z-index: 40;
          transform: translateX(-100%); box-shadow: 2px 0 18px rgba(0,0,0,.35);
        }
        .sidebar.open { transform: translateX(0); }
        .mobile-close { display: inline-flex; }
        .mobile-scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 39; }
        .mobile-menu-btn { display: inline-flex; }
        .grid-2 { grid-template-columns: 1fr; }
        .form-grid { grid-template-columns: 1fr; }
        .stat-grid { grid-template-columns: repeat(2, 1fr); }
        .toolbar { flex-wrap: wrap; }
        .search-box { min-width: 0; width: 100%; order: 1; }
        .filter-chips { order: 2; width: 100%; }
        .filter-chips select { flex: 1; min-width: 100px; }
        .toolbar-spacer { display: none; }

        /* Card-style responsive tables: no more sideways scrolling */
        .table { border: none; background: transparent; }
        .table thead { display: none; }
        .table tr { display: block; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 9px; margin-bottom: 10px; padding: 4px 0; }
        .table td { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px dashed var(--border); text-align: right; }
        .table td:last-child { border-bottom: none; }
        .table td[data-label]::before { content: attr(data-label); font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); text-align: left; flex-shrink: 0; }
        .table td.row-actions { justify-content: flex-end; }
        .table td.row-actions::before { display: none; }
        .table td.empty { display: block; text-align: center; }
        .table td.empty::before { content: none; }
      }
      @media (max-width: 480px) {
        .stat-grid { grid-template-columns: 1fr 1fr; }
        .demo-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}

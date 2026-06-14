import { useEffect, useState, useCallback } from "react";
import { api, MODE } from "./lib/store.js";
import { MONTHS } from "./lib/format.js";
import Auth from "./components/Auth.jsx";
import Dashboard from "./components/Dashboard.jsx";
import History from "./components/History.jsx";
import Budgets from "./components/Budgets.jsx";
import Settings from "./components/Settings.jsx";
import ExpenseSheet from "./components/ExpenseSheet.jsx";
import ResetPassword from "./components/ResetPassword.jsx";

const TABS = ["dashboard", "history", "budgets", "settings"];

// Each tab is a hash route (#/dashboard, #/history, …) so the browser keeps a
// history entry per page. That makes the phone's Back button move between tabs
// (and close the add/edit sheet) instead of leaving the app.
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [t, sub] = raw.split("/");
  return {
    tab: TABS.includes(t) ? t : "dashboard",
    sheetOpen: sub === "add" || sub === "edit",
  };
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined=loading
  const [tab, setTab] = useState(() => parseHash().tab);
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [sheet, setSheet] = useState({ open: false, kind: "expense", entry: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [recovering, setRecovering] = useState(false); // true after clicking email reset link

  const loadSession = useCallback(async () => {
    try {
      // Watchdog: if getSession hangs (e.g. bad Supabase URL), don't spin forever.
      const result = await Promise.race([
        api.getSession(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
      ]);
      setSession(result);
    } catch (e) {
      console.error("getSession failed:", e);
      if (MODE === "cloud") { setLoadError(e.message || "Could not connect."); setSession(null); }
      else { setSession(null); }
    }
  }, []);

  useEffect(() => {
    loadSession();
    if (MODE === "cloud" && api.onAuthChange) {
      const { data } = api.onAuthChange((event) => {
        // Arriving from the password-reset email link: show the set-password screen.
        if (event === "PASSWORD_RECOVERY") { setRecovering(true); return; }
        loadSession();
      });
      return () => data?.subscription?.unsubscribe?.();
    }
  }, [loadSession]);

  // Load reference data once we have a session.
  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        setCategories(await api.getCategories());
        setMembers(await api.getMembers());
      } catch (e) { console.error(e); }
    })();
  }, [session, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // Keep React state in sync with the URL hash, and react to Back/Forward.
  useEffect(() => {
    const { tab: t, sheetOpen } = parseHash();
    // Normalise on first load: always have a tab route, and never restore the
    // sheet from the URL (we have no entry to edit after a refresh).
    if (!window.location.hash || sheetOpen) {
      window.history.replaceState(null, "", "#/" + t);
    }

    const onHash = () => {
      const next = parseHash();
      setTab(next.tab);
      // Back button left the sheet route -> close the sheet.
      if (!next.sheetOpen) {
        setSheet((s) => (s.open ? { open: false, kind: "expense", entry: null } : s));
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Switch tabs by changing the hash, which pushes a new history entry.
  const goTab = (id) => { window.location.hash = "#/" + id; };

  // Opening the sheet pushes a history entry so Back (or the × icon) closes it.
  const openSheet = (kind, entry) => {
    setSheet({ open: true, kind, entry });
    window.location.hash = "#/" + parseHash().tab + "/" + (entry ? "edit" : "add");
  };
  const closeSheet = () => {
    if (parseHash().sheetOpen) window.history.back();
    else setSheet({ open: false, kind: "expense", entry: null });
  };

  // Returning from the reset email: let the user set a new password.
  if (MODE === "cloud" && recovering) {
    return <ResetPassword onDone={() => { setRecovering(false); setSession(undefined); loadSession(); }} />;
  }

  if (session === undefined) {
    return (
      <div className="center" style={{ flexDirection: "column", gap: 12, padding: 24, textAlign: "center" }}>
        <div>Loading…</div>
        <div className="hint">Mode: {MODE}. If this doesn't clear, open the browser console (F12) for errors.</div>
      </div>
    );
  }
  if (MODE === "cloud" && loadError) {
    return (
      <div className="center" style={{ flexDirection: "column", gap: 12, padding: 24, textAlign: "center" }}>
        <div className="err">Couldn't reach Supabase: {loadError}</div>
        <div className="hint">Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in <code>app/.env</code>, then restart the dev server.</div>
        <button className="btn" onClick={() => { setLoadError(null); setSession(undefined); loadSession(); }}>Retry</button>
      </div>
    );
  }
  if (MODE === "cloud" && !session) return <Auth onDone={loadSession} />;

  const monthLabel = MONTHS[cur.getMonth()] + " " + cur.getFullYear();
  const shiftMonth = (n) => setCur((d) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; });
  const showMonth = tab === "dashboard" || tab === "history" || tab === "budgets";

  return (
    <div className="app">
      <header>
        <div className="title"><span className="dot" /> Home Finance Tracker</div>
        <div className="sub">
          {session?.household?.name || "My Household"}
          <span className={"mode " + MODE}>{MODE === "cloud" ? "Shared" : "Local"}</span>
        </div>
        {showMonth && (
          <div className="month">
            <button onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            <div className="label">{monthLabel}</div>
            <button onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          </div>
        )}
      </header>

      <main>
        {tab === "dashboard" && <Dashboard cur={cur} categories={categories} refreshKey={refreshKey} />}
        {tab === "history" && (
          <History cur={cur} categories={categories} members={members} refreshKey={refreshKey}
                   onEdit={(kind, entry) => openSheet(kind, entry)} />
        )}
        {tab === "budgets" && <Budgets cur={cur} categories={categories} refreshKey={refreshKey} onChange={refresh} />}
        {tab === "settings" && <Settings session={session} categories={categories} members={members} onChange={refresh} />}
      </main>

      <button className="fab" aria-label="Add entry" onClick={() => openSheet("expense", null)}>+</button>

      <nav className="tabs">
        <Tab id="dashboard" cur={tab} set={goTab} icon="📊" label="Dashboard" />
        <Tab id="history" cur={tab} set={goTab} icon="🧾" label="History" />
        <Tab id="budgets" cur={tab} set={goTab} icon="🎯" label="Budgets" />
        <Tab id="settings" cur={tab} set={goTab} icon="⚙️" label="Settings" />
      </nav>

      <ExpenseSheet
        open={sheet.open}
        kind={sheet.kind}
        entry={sheet.entry}
        categories={categories}
        members={members}
        onClose={closeSheet}
        onSaved={(date) => {
          if (date) { const d = new Date(date + "T00:00:00"); d.setDate(1); setCur(d); }
          closeSheet();
          refresh();
        }}
      />
    </div>
  );
}

function Tab({ id, cur, set, icon, label }) {
  return (
    <button className={cur === id ? "active" : ""} onClick={() => set(id)}>
      <span className="ti">{icon}</span>{label}
    </button>
  );
}

import { useState, useEffect } from "react";
import { api, MODE } from "../lib/store.js";
import { CURRENCY, fmt, hexA } from "../lib/format.js";

export default function Settings({ session, categories, members, onChange }) {
  const [newPerson, setNewPerson] = useState("");
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);

  // recurring income
  const [recs, setRecs] = useState([]);
  const [rAmount, setRAmount] = useState("");
  const [rSource, setRSource] = useState("Salary");
  const [rDay, setRDay] = useState("15");
  const [rWho, setRWho] = useState(members[0]?.id ?? null);

  async function loadRecs() {
    try { setRecs(await api.getRecurringIncome()); } catch { setRecs([]); }
  }
  useEffect(() => { loadRecs(); }, []);
  useEffect(() => { if (!rWho && members[0]) setRWho(members[0].id); }, [members, rWho]);

  async function addRec() {
    const amt = parseFloat(String(rAmount).replace(/[^0-9.]/g, ""));
    const day = Math.min(31, Math.max(1, parseInt(rDay, 10) || 1));
    if (!amt || amt <= 0) { alert("Enter an amount."); return; }
    setBusy(true);
    try {
      await api.addRecurringIncome({ amount: amt, source: rSource.trim() || "Salary", day_of_month: day, received_by: rWho });
      setRAmount(""); await loadRecs(); onChange();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  async function delRec(id) {
    try { await api.deleteRecurringIncome(id); await loadRecs(); onChange(); } catch (e) { alert(e.message); }
  }
  const whoName = (id) => members.find((m) => m.id === id)?.display_name || "—";

  async function addPerson() {
    if (!newPerson.trim()) return;
    setBusy(true);
    try { await api.addMember(newPerson.trim()); setNewPerson(""); onChange(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  async function removePerson(id) {
    try { await api.removeMember(id); onChange(); } catch (e) { alert(e.message); }
  }
  async function addCat() {
    if (!newCat.trim()) return;
    setBusy(true);
    try { await api.addCategory(newCat.trim()); setNewCat(""); onChange(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  async function delCat(id) {
    try { await api.deleteCategory(id); onChange(); } catch (e) { alert(e.message); }
  }

  function exportBackup() {
    const data = api.exportData();
    if (!data) { alert("Cloud data lives in Supabase — use the dashboard to export."); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "home-finance-backup.json";
    a.click();
  }
  async function clearAll() {
    if (!confirm("Delete ALL local data on this device? This cannot be undone.")) return;
    await api.clearAll(); onChange();
  }
  async function signOut() { await api.signOut(); location.reload(); }

  return (
    <>
      <div className="section-h">Recurring income <span className="pill">{recs.length}</span></div>
      <div className="card" style={{ padding: "6px 16px 16px" }}>
        {recs.length === 0 && <div className="hint" style={{ padding: "10px 0" }}>No recurring income yet. Add your salary below so it appears automatically every month.</div>}
        {recs.map((r) => (
          <div className="mgr-row" key={r.id}>
            <div className="ic" style={{ background: hexA("#0f766e", 0.14), width: 32, height: 32, borderRadius: 9, fontSize: 16 }}>💰</div>
            <div className="nm">{r.source} · {fmt(r.amount)}<div className="hint" style={{ margin: 0 }}>day {r.day_of_month} · {whoName(r.received_by)}</div></div>
            <button className="x" onClick={() => delRec(r.id)}>✕</button>
          </div>
        ))}
        <label className="fl">Add salary / recurring income</label>
        <div className="rec-grid">
          <input inputMode="decimal" placeholder={CURRENCY + " amount"} value={rAmount} onChange={(e) => setRAmount(e.target.value)} />
          <input placeholder="Source (e.g. Salary)" value={rSource} onChange={(e) => setRSource(e.target.value)} />
          <input inputMode="numeric" placeholder="Day (1-31)" value={rDay} onChange={(e) => setRDay(e.target.value)} />
          <select value={rWho ?? ""} onChange={(e) => setRWho(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        </div>
        <button className="btn" onClick={addRec} disabled={busy} style={{ marginTop: 12 }}>Add recurring income</button>
        <div className="hint">e.g. ₱30,000 Salary on day 15 — auto-counted every month.</div>
      </div>

      <div className="section-h">People <span className="pill">{members.length}</span></div>
      <div className="card" style={{ padding: "6px 16px 16px" }}>
        {members.map((m) => (
          <div className="mgr-row" key={m.id}>
            <div className="nm">👤 {m.display_name}</div>
            {MODE === "local" && members.length > 1
              ? <button className="x" onClick={() => removePerson(m.id)}>✕</button>
              : <span className="pill">member</span>}
          </div>
        ))}
        {MODE === "local" ? (
          <>
            <div className="add-inline">
              <input value={newPerson} maxLength={24} placeholder="Add a person…"
                onChange={(e) => setNewPerson(e.target.value)} />
              <button onClick={addPerson} disabled={busy}>Add</button>
            </div>
            <div className="hint">Built to scale — add as many household members as you like.</div>
          </>
        ) : (
          <div className="hint">New members join by signing up with your household. Share the setup steps from the README.</div>
        )}
      </div>

      <div className="section-h">Categories</div>
      <div className="card" style={{ padding: "6px 16px 16px" }}>
        {categories.map((c) => (
          <div className="mgr-row" key={c.id}>
            <div className="ic" style={{ background: hexA(c.color, 0.14), width: 32, height: 32, borderRadius: 9, fontSize: 16 }}>{c.icon}</div>
            <div className="nm">{c.name}</div>
            {c.is_default ? <span className="pill">default</span>
              : <button className="x" onClick={() => delCat(c.id)}>✕</button>}
          </div>
        ))}
        <div className="add-inline">
          <input value={newCat} maxLength={24} placeholder="Add a category…"
            onChange={(e) => setNewCat(e.target.value)} />
          <button onClick={addCat} disabled={busy}>Add</button>
        </div>
        <div className="hint">Standard list plus your own additions.</div>
      </div>

      <div className="section-h">Account &amp; data</div>
      <div className="card" style={{ padding: 16 }}>
        <div className="hint" style={{ margin: "0 0 12px" }}>
          Currency: {CURRENCY} Philippine Peso · Mode: {MODE === "cloud" ? "Shared (cloud)" : "Local (this device)"}
        </div>
        {MODE === "local" && <button className="btn ghost" onClick={exportBackup}>⬇️ Export backup (.json)</button>}
        {MODE === "local"
          ? <button className="btn danger" onClick={clearAll}>Clear all data</button>
          : <button className="btn ghost" onClick={signOut}>Sign out</button>}
      </div>

      <div className="hint" style={{ textAlign: "center", marginTop: 18 }}>
        Home Finance Tracker · Phase 1–3<br />
        Connect Claude via the MCP server (see README) to add &amp; query expenses by chat.
      </div>
    </>
  );
}

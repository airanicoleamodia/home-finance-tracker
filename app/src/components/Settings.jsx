import { useState, useEffect } from "react";
import { api, MODE } from "../lib/store.js";
import { CURRENCY, CURRENCY_CODE, CURRENCIES, CURRENCY_SYMBOLS, setCurrency, fmt, hexA } from "../lib/format.js";

const ACCOUNT_ICONS = ["💵", "🏦", "📱", "🐷", "💳", "💰", "📦"];

export default function Settings({ session, categories, members, onChange }) {
  const [newPerson, setNewPerson] = useState("");
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);

  // The household creator is the admin; local mode is always admin (single owner).
  const isAdmin = MODE === "local" || session?.user?.role === "admin";

  // accounts (money locations, manual balances)
  const [accounts, setAccounts] = useState([]);
  const [aName, setAName] = useState("");
  const [aIcon, setAIcon] = useState("🏦");
  const [aBal, setABal] = useState("");

  async function loadAccounts() {
    try { setAccounts(await api.getAccounts()); } catch { setAccounts([]); }
  }
  useEffect(() => { loadAccounts(); }, []);

  async function addAccount() {
    if (!aName.trim()) { alert("Name the account (e.g. BPI, GCash, Cash)."); return; }
    const bal = parseFloat(String(aBal).replace(/[^0-9.]/g, "")) || 0;
    setBusy(true);
    try {
      await api.addAccount({ name: aName.trim(), icon: aIcon, balance: bal });
      setAName(""); setABal(""); setAIcon("🏦");
      await loadAccounts(); onChange();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  async function saveAccount(id, patch) {
    try { await api.updateAccount(id, patch); await loadAccounts(); onChange(); }
    catch (e) { alert(e.message); }
  }
  async function delAccount(id) {
    if (!confirm("Remove this account?")) return;
    try { await api.deleteAccount(id); await loadAccounts(); onChange(); }
    catch (e) { alert(e.message); }
  }
  const accTotal = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);

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

  // recurring expenses
  const [recExp, setRecExp] = useState([]);
  async function loadRecExp() {
    try { setRecExp(await api.getRecurringExpenses()); } catch { setRecExp([]); }
  }
  useEffect(() => { loadRecExp(); }, []);
  async function delRecExp(id) {
    try { await api.deleteRecurringExpense(id); await loadRecExp(); onChange(); } catch (e) { alert(e.message); }
  }
  const catOf = (id) => categories.find((c) => c.id === id) || { name: "Uncategorized", icon: "🏷️", color: "#6b7280" };
  const whoName = (id) => members.find((m) => m.id === id)?.display_name || "—";

  // currency + theme
  const [curCode, setCurCode] = useState(CURRENCY_CODE);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");

  async function changeCurrency(code) {
    setCurCode(code); setCurrency(code);
    try { await api.updateHouseholdCurrency(code); onChange(); } catch (e) { alert(e.message); }
  }
  function toggleDark() {
    const next = !dark; setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "";
    try { localStorage.setItem("hft_theme", next ? "dark" : "light"); } catch (e) {}
  }

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
    if (!confirm("Delete this category? Existing expenses will become Uncategorized.")) return;
    try { await api.deleteCategory(id); onChange(); } catch (e) { alert(e.message); }
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }
  async function exportBackup() {
    try {
      const data = await api.exportData();
      download("home-finance-backup.json", JSON.stringify(data, null, 2), "application/json");
    } catch (e) { alert(e.message); }
  }
  async function exportCSV() {
    try {
      const data = await api.exportData();
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = [["type", "date", "amount", "category/source", "who", "account", "note"]];
      (data.expenses || []).forEach((e) =>
        rows.push(["expense", e.spent_on, e.amount, catOf(e.category_id).name, whoName(e.paid_by), accNameById(e.account_id), e.note]));
      (data.income || []).forEach((e) =>
        rows.push(["income", e.received_on, e.amount, e.source, whoName(e.received_by), accNameById(e.account_id), e.note]));
      (data.transfers || []).forEach((t) =>
        rows.push(["transfer", t.moved_on, t.amount, "", "", `${accNameById(t.from_account)} -> ${accNameById(t.to_account)}`, t.note]));
      const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
      download("home-finance-export.csv", csv, "text/csv");
    } catch (e) { alert(e.message); }
  }
  const accNameById = (id) => accounts.find((a) => a.id === id)?.name || "";
  function reloadLists() { loadAccounts(); loadRecs(); loadRecExp(); }

  async function resetData() {
    if (prompt("This deletes ALL transactions (expenses, income, transfers, recurring rules, budgets) and resets every account balance to 0.\n\nYour accounts, categories and people are kept.\n\nType RESET to confirm.") !== "RESET") return;
    setBusy(true);
    try { await api.resetData(); reloadLists(); onChange(); alert("Done — your household is starting fresh."); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  async function factoryReset() {
    if (prompt("This ERASES EVERYTHING — all transactions, your custom accounts and categories — and restores the default setup.\n\nType ERASE to confirm.") !== "ERASE") return;
    setBusy(true);
    try {
      await (api.factoryReset ? api.factoryReset() : api.clearAll());
      reloadLists(); onChange(); alert("Everything erased. The app is back to a clean default state.");
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  async function logOut() {
    if (!confirm("Log out of your household account?")) return;
    await api.signOut(); location.reload();
  }

  async function copyInvite() {
    const id = session?.household?.id;
    if (!id) { alert("No household id available."); return; }
    const link = `${window.location.origin}?invite=${id}`;
    try { await navigator.clipboard.writeText(link); alert("Invite link copied!\n\n" + link); }
    catch { prompt("Copy this invite link:", link); }
  }

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
        <div className="hint">e.g. {CURRENCY}30,000 Salary on day 15 — auto-counted every month.</div>
      </div>

      <div className="section-h">Recurring expenses <span className="pill">{recExp.length}</span></div>
      <div className="card" style={{ padding: "6px 16px 16px" }}>
        {recExp.length === 0 && <div className="hint" style={{ padding: "10px 0" }}>No recurring expenses yet. Add rent, tuition or subscriptions from the <strong>+</strong> button (tick "Repeat every month").</div>}
        {recExp.map((r) => {
          const c = catOf(r.category_id);
          return (
            <div className="mgr-row" key={r.id}>
              <div className="ic" style={{ background: hexA(c.color, 0.14), width: 32, height: 32, borderRadius: 9, fontSize: 16 }}>{c.icon}</div>
              <div className="nm">{c.name} · {fmt(r.amount)}<div className="hint" style={{ margin: 0 }}>day {r.day_of_month} · {whoName(r.paid_by)}{r.note ? " · " + r.note : ""}</div></div>
              <button className="x" onClick={() => delRecExp(r.id)}>✕</button>
            </div>
          );
        })}
      </div>

      <div className="section-h">
        Accounts (where your money is)
        {accounts.length > 0 && <span className="pill">{fmt(accTotal)}</span>}
      </div>
      <div className="card" style={{ padding: "6px 16px 16px" }}>
        {accounts.length === 0 && (
          <div className="hint" style={{ padding: "10px 0" }}>
            Add your banks, e-wallets and cash so you can see where your money sits. You keep each balance up to date here.
          </div>
        )}
        {accounts.map((a) => (
          <AccountRow key={a.id} a={a} onSave={saveAccount} onDelete={delAccount} />
        ))}
        <label className="fl">Add an account</label>
        <div className="chips">
          {ACCOUNT_ICONS.map((ic) => (
            <button type="button" key={ic}
              className={"chip" + (ic === aIcon ? " sel" : "")}
              onClick={() => setAIcon(ic)}>{ic}</button>
          ))}
        </div>
        <div className="rec-grid" style={{ marginTop: 10 }}>
          <input value={aName} maxLength={28} placeholder="Name (e.g. BPI, GCash)" onChange={(e) => setAName(e.target.value)} />
          <input inputMode="decimal" placeholder={CURRENCY + " balance"} value={aBal} onChange={(e) => setABal(e.target.value)} />
        </div>
        <button className="btn" onClick={addAccount} disabled={busy} style={{ marginTop: 12 }}>Add account</button>
        <div className="hint">These balances are manual — update them whenever money moves.</div>
      </div>

      <div className="section-h">People <span className="pill">{members.length}</span></div>
      <div className="card" style={{ padding: "6px 16px 16px" }}>
        {members.map((m) => (
          <div className="mgr-row" key={m.id}>
            <div className="nm">👤 {m.display_name}</div>
            {m.role === "admin"
              ? <span className="pill" style={{ background: "var(--brand-soft)", color: "#0b554f" }}>admin</span>
              : MODE === "local" && members.length > 1
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
        ) : isAdmin ? (
          <>
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={copyInvite}>🔗 Copy invite link</button>
            <div className="hint">Send this link to family. When they sign up through it, they join this household automatically.</div>
          </>
        ) : (
          <div className="hint">Only the household admin can invite new members.</div>
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

      <div className="section-h">Preferences</div>
      <div className="card" style={{ padding: 16 }}>
        <label className="fl" style={{ marginTop: 0 }}>Currency {!isAdmin && <span className="hint" style={{ margin: 0 }}>(admin only)</span>}</label>
        <select value={curCode} onChange={(e) => changeCurrency(e.target.value)} disabled={!isAdmin}>
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>{CURRENCY_SYMBOLS[code]} {code}</option>
          ))}
        </select>

        <label className="switch" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={dark} onChange={toggleDark} />
          <span>Dark mode 🌙</span>
        </label>
      </div>

      <div className="section-h">Account &amp; data</div>
      <div className="card" style={{ padding: 16 }}>
        <div className="hint" style={{ margin: "0 0 12px" }}>
          Mode: {MODE === "cloud" ? "Shared (cloud)" : "Local (this device)"}
        </div>
        <button className="btn ghost" onClick={exportCSV}>⬇️ Export CSV</button>
        <button className="btn ghost" onClick={exportBackup}>⬇️ Export backup (.json)</button>
        {MODE === "cloud" && <button className="btn danger" onClick={logOut}>🚪 Log out</button>}
      </div>

      <div className="section-h" style={{ color: "var(--danger)" }}>⚠️ Danger zone</div>
      <div className="card" style={{ padding: 16, borderColor: "var(--danger)" }}>
        {!isAdmin ? (
          <div className="hint" style={{ margin: 0 }}>Only the household admin can reset or erase shared data.</div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Reset data (start fresh)</div>
            <div className="hint" style={{ margin: "4px 0 10px" }}>
              Deletes every transaction and zeroes account balances, but keeps your accounts, categories and people. Good for a clean new month or year.
            </div>
            <button className="btn danger" onClick={resetData} disabled={busy}>Reset data</button>

            <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 18 }}>Erase everything</div>
            <div className="hint" style={{ margin: "4px 0 10px" }}>
              Removes ALL data including your custom accounts and categories, then restores the default setup. The household{MODE === "cloud" ? " and everyone's logins stay" : " stays"} intact.
            </div>
            <button className="btn danger" onClick={factoryReset} disabled={busy}>Erase everything</button>

            {MODE === "cloud" && (
              <div className="hint" style={{ marginTop: 16 }}>
                Note: permanently deleting the whole household and member logins must be done from your Supabase dashboard — it can't be undone and isn't available in-app for safety.
              </div>
            )}
          </>
        )}
      </div>

      <div className="hint" style={{ textAlign: "center", marginTop: 18 }}>
        Home Finance Tracker · Phase 1–3<br />
        Connect Claude via the MCP server (see README) to add &amp; query expenses by chat.
      </div>
    </>
  );
}

// One editable account: change its name or balance inline (saved on blur).
function AccountRow({ a, onSave, onDelete }) {
  const [name, setName] = useState(a.name);
  const [bal, setBal] = useState(String(a.balance));

  // Keep local fields in sync if the list reloads with new values.
  useEffect(() => { setName(a.name); setBal(String(a.balance)); }, [a.name, a.balance]);

  const saveName = () => {
    const v = name.trim();
    if (v && v !== a.name) onSave(a.id, { name: v }); else setName(a.name);
  };
  const saveBal = () => {
    const v = parseFloat(String(bal).replace(/[^0-9.]/g, "")) || 0;
    if (v !== Number(a.balance)) onSave(a.id, { balance: v }); else setBal(String(a.balance));
  };

  // Tap the icon to cycle through the presets (saved immediately).
  const cycleIcon = () => {
    const i = ACCOUNT_ICONS.indexOf(a.icon);
    onSave(a.id, { icon: ACCOUNT_ICONS[(i + 1) % ACCOUNT_ICONS.length] });
  };

  return (
    <div className="mgr-row">
      <button type="button" className="ic" onClick={cycleIcon} title="Tap to change icon"
        style={{ width: 32, height: 32, borderRadius: 9, fontSize: 16, background: "#f0f2f2", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", padding: 0 }}>{a.icon}</button>
      <input className="acc-name" value={name} maxLength={28}
        onChange={(e) => setName(e.target.value)} onBlur={saveName}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      <input className="acc-bal-in" inputMode="decimal" value={bal}
        onChange={(e) => setBal(e.target.value)} onBlur={saveBal}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      <button className="x" onClick={() => onDelete(a.id)}>✕</button>
    </div>
  );
}

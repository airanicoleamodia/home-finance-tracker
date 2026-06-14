import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { CURRENCY, todayISO } from "../lib/format.js";

// Handles both EXPENSE and INCOME entries (add + edit), plus recurring income.
export default function ExpenseSheet({ open, kind: initialKind, entry, categories, members, accounts = [], onClose, onSaved }) {
  const editing = Boolean(entry);
  const [kind, setKind] = useState("expense"); // "expense" | "income"
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState(null);
  const [source, setSource] = useState("Salary");
  const [who, setWho] = useState(null);
  const [accId, setAccId] = useState(null); // which account income lands in
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const k = editing ? initialKind : initialKind || "expense";
    setKind(k);
    setErr(false);
    setRepeat(false);
    setAmount(entry ? String(entry.amount) : "");
    setCatId(entry && k === "expense" ? entry.category_id : categories[0]?.id ?? null);
    setSource(entry && k === "income" ? entry.source || "Income" : "Salary");
    setWho(entry ? (k === "expense" ? entry.paid_by : entry.received_by) : members[0]?.id ?? null);
    setAccId(accounts[0]?.id ?? null);
    setDate(entry ? (k === "expense" ? entry.spent_on : entry.received_on) : todayISO());
    setNote(entry ? entry.note || "" : "");
  }, [open, entry, initialKind, categories, members, accounts, editing]);

  async function save() {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, ""));
    if (!amt || amt <= 0) { setErr(true); return; }
    setBusy(true);
    try {
      if (kind === "expense") {
        const payload = { amount: amt, category_id: catId, paid_by: who, note: note.trim(), spent_on: date };
        if (editing) await api.updateExpense(entry.id, payload);
        else await api.addExpense(payload);
      } else {
        // income
        if (!editing && repeat) {
          const day = parseInt(date.slice(8, 10), 10) || 1;
          await api.addRecurringIncome({
            amount: amt, source: source.trim() || "Salary", day_of_month: day,
            received_by: who, note: note.trim(), start_month: date.slice(0, 7),
          });
        } else {
          const payload = { amount: amt, source: source.trim() || "Income", received_by: who, note: note.trim(), received_on: date };
          if (editing) await api.updateIncome(entry.id, payload);
          else {
            await api.addIncome(payload);
            // New one-time income lands in the chosen account: add to its balance.
            const acc = accounts.find((a) => a.id === accId);
            if (acc) await api.updateAccount(acc.id, { balance: Number(acc.balance || 0) + amt });
          }
        }
      }
      onSaved(editing ? null : date);
    } catch (e) {
      alert(e.message || "Could not save.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Delete this entry?")) return;
    setBusy(true);
    try {
      if (kind === "expense") await api.deleteExpense(entry.id);
      else await api.deleteIncome(entry.id);
      onSaved(null);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  const isIncome = kind === "income";

  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
      <div className={"sheet" + (open ? " open" : "")}>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        <div className="grab" />

        {!editing && (
          <div className="seg">
            <button className={!isIncome ? "on" : ""} onClick={() => setKind("expense")}>− Expense</button>
            <button className={isIncome ? "on income" : ""} onClick={() => setKind("income")}>+ Income</button>
          </div>
        )}

        <h3>{editing ? (isIncome ? "Edit income" : "Edit expense") : isIncome ? "Add income" : "Add expense"}</h3>

        <input
          className="amount-in" inputMode="decimal" placeholder={CURRENCY + "0"}
          value={amount}
          style={err ? { borderColor: "var(--danger)" } : isIncome ? { color: "var(--brand)" } : undefined}
          onChange={(e) => { setAmount(e.target.value); setErr(false); }}
          autoFocus={!editing}
        />

        {isIncome ? (
          <>
            <label className="fl">Source</label>
            <div className="chips">
              {["Salary", "Bonus", "Side gig", "Gift", "Other"].map((s) => (
                <button type="button" key={s}
                  className={"chip" + (s === source ? " sel" : "")}
                  onClick={() => setSource(s)}>{s}</button>
              ))}
            </div>
            <label className="fl">Or type a custom source</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Salary" />

            <label className="fl">Who earned it</label>
            <div className="chips">
              {members.map((m) => (
                <button type="button" key={m.id}
                  className={"chip" + (m.id === who ? " sel" : "")}
                  onClick={() => setWho(m.id)}>👤 {m.display_name}</button>
              ))}
            </div>

            {!editing && !repeat && accounts.length > 0 && (
              <>
                <label className="fl">Goes to which account</label>
                <div className="chips">
                  {accounts.map((a) => (
                    <button type="button" key={a.id}
                      className={"chip" + (a.id === accId ? " sel" : "")}
                      onClick={() => setAccId(a.id)}>{a.icon} {a.name}</button>
                  ))}
                </div>
                <div className="hint" style={{ margin: "6px 2px 0" }}>This amount is added to that account's balance.</div>
              </>
            )}

            <label className="fl">Date received</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

            {!editing && (
              <label className="switch">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                <span>Repeat every month (e.g. salary on day {parseInt(date.slice(8, 10), 10) || 1})</span>
              </label>
            )}
          </>
        ) : (
          <>
            <label className="fl">Category</label>
            <div className="chips">
              {categories.map((c) => (
                <button type="button" key={c.id}
                  className={"chip" + (c.id === catId ? " sel" : "")}
                  onClick={() => setCatId(c.id)}>{c.icon} {c.name}</button>
              ))}
            </div>

            <label className="fl">Who paid</label>
            <div className="chips">
              {members.map((m) => (
                <button type="button" key={m.id}
                  className={"chip" + (m.id === who ? " sel" : "")}
                  onClick={() => setWho(m.id)}>👤 {m.display_name}</button>
              ))}
            </div>

            <label className="fl">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </>
        )}

        <label className="fl">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={isIncome ? "e.g. May payroll" : "e.g. weekly market run"} />

        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : isIncome ? (repeat ? "Add recurring income" : "Add income") : "Add expense"}
        </button>
        {editing && <button className="btn danger" onClick={remove} disabled={busy}>Delete</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

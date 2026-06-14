import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { CURRENCY, todayISO } from "../lib/format.js";

// Handles EXPENSE and INCOME entries (add + edit), recurring rules, and TRANSFERS.
export default function ExpenseSheet({ open, kind: initialKind, entry, categories, members, accounts = [], onClose, onSaved }) {
  const editing = Boolean(entry);
  const [kind, setKind] = useState("expense"); // "expense" | "income" | "transfer"
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState(null);
  const [source, setSource] = useState("Salary");
  const [who, setWho] = useState(null);
  const [accId, setAccId] = useState(null);     // account the income/expense touches
  const [fromAcc, setFromAcc] = useState(null); // transfer: source account
  const [toAcc, setToAcc] = useState(null);     // transfer: destination account
  const [fee, setFee] = useState("");           // transfer: optional fee (becomes an expense)
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
    setAccId(entry?.account_id ?? accounts[0]?.id ?? null);
    setFromAcc(accounts[0]?.id ?? null);
    setToAcc(accounts[1]?.id ?? accounts[0]?.id ?? null);
    setFee("");
    setDate(entry ? (k === "expense" ? entry.spent_on : entry.received_on) : todayISO());
    setNote(entry ? entry.note || "" : "");
  }, [open, entry, initialKind, categories, members, accounts, editing]);

  async function save() {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, ""));
    if (!amt || amt <= 0) { setErr(true); return; }

    if (kind === "transfer") {
      if (!fromAcc || !toAcc) { alert("Pick both a 'from' and a 'to' account."); return; }
      if (fromAcc === toAcc) { alert("Choose two different accounts."); return; }
      const feeAmt = parseFloat(String(fee).replace(/[^0-9.]/g, "")) || 0;
      // Fee is logged under a "Transfer Fee" category if one exists, else "Other".
      const feeCat = categories.find((c) => (c.name || "").toLowerCase() === "transfer fee")
        || categories.find((c) => (c.name || "").toLowerCase() === "other")
        || categories[0];
      setBusy(true);
      try {
        await api.addTransfer({
          amount: amt, from_account: fromAcc, to_account: toAcc, note: note.trim(), moved_on: date,
          fee: feeAmt, fee_category_id: feeAmt > 0 ? (feeCat?.id ?? null) : null,
        });
        onSaved(date);
      } catch (e) { alert(e.message || "Could not save."); }
      finally { setBusy(false); }
      return;
    }

    setBusy(true);
    try {
      if (kind === "expense") {
        if (!editing && repeat) {
          const day = parseInt(date.slice(8, 10), 10) || 1;
          await api.addRecurringExpense({
            amount: amt, category_id: catId, paid_by: who, day_of_month: day,
            note: note.trim(), start_month: date.slice(0, 7),
          });
        } else {
          const payload = { amount: amt, category_id: catId, paid_by: who, account_id: accId, note: note.trim(), spent_on: date };
          if (editing) await api.updateExpense(entry.id, payload);
          else await api.addExpense(payload);
        }
      } else {
        // income
        if (!editing && repeat) {
          const day = parseInt(date.slice(8, 10), 10) || 1;
          await api.addRecurringIncome({
            amount: amt, source: source.trim() || "Salary", day_of_month: day,
            received_by: who, note: note.trim(), start_month: date.slice(0, 7),
          });
        } else {
          const payload = { amount: amt, source: source.trim() || "Income", received_by: who, account_id: accId, note: note.trim(), received_on: date };
          if (editing) await api.updateIncome(entry.id, payload);
          else await api.addIncome(payload);
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
  const isTransfer = kind === "transfer";
  const title = editing
    ? (isIncome ? "Edit income" : "Edit expense")
    : isTransfer ? "Move money" : isIncome ? "Add income" : "Add expense";

  const isoMinus = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const DateField = () => (
    <>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="chips" style={{ marginTop: 6 }}>
        <button type="button" className={"chip" + (date === todayISO() ? " sel" : "")} onClick={() => setDate(todayISO())}>Today</button>
        <button type="button" className={"chip" + (date === isoMinus(1) ? " sel" : "")} onClick={() => setDate(isoMinus(1))}>Yesterday</button>
      </div>
    </>
  );

  const AccountChips = ({ value, onPick }) => (
    <div className="chips">
      {accounts.map((a) => (
        <button type="button" key={a.id}
          className={"chip" + (a.id === value ? " sel" : "")}
          onClick={() => onPick(a.id)}>{a.icon} {a.name}</button>
      ))}
    </div>
  );

  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
      <div className={"sheet" + (open ? " open" : "")}>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        <div className="grab" />

        {!editing && (
          <div className="seg seg-3">
            <button className={kind === "expense" ? "on" : ""} onClick={() => setKind("expense")}>− Expense</button>
            <button className={kind === "income" ? "on income" : ""} onClick={() => setKind("income")}>+ Income</button>
            <button className={isTransfer ? "on" : ""} onClick={() => setKind("transfer")}>⇄ Transfer</button>
          </div>
        )}

        <h3>{title}</h3>

        <input
          className="amount-in" inputMode="decimal" placeholder={CURRENCY + "0"}
          value={amount}
          style={err ? { borderColor: "var(--danger)" } : isIncome ? { color: "var(--brand)" } : undefined}
          onChange={(e) => { setAmount(e.target.value); setErr(false); }}
          autoFocus={!editing}
        />

        {isTransfer ? (
          <>
            <label className="fl">From account</label>
            {accounts.length > 0 ? <AccountChips value={fromAcc} onPick={setFromAcc} />
              : <div className="hint">Add accounts in Settings first.</div>}

            <label className="fl">To account</label>
            {accounts.length > 0 && <AccountChips value={toAcc} onPick={setToAcc} />}

            <label className="fl">Transfer fee (optional)</label>
            <input inputMode="decimal" placeholder={CURRENCY + "0"} value={fee}
              onChange={(e) => setFee(e.target.value)} />
            <div className="hint" style={{ margin: "6px 2px 0" }}>Charged to the source account and recorded as an expense.</div>

            <label className="fl">Date</label>
            <DateField />
          </>
        ) : isIncome ? (
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

            {!repeat && accounts.length > 0 && (
              <>
                <label className="fl">Goes to which account</label>
                <AccountChips value={accId} onPick={setAccId} />
              </>
            )}

            <label className="fl">Date received</label>
            <DateField />

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

            {!repeat && accounts.length > 0 && (
              <>
                <label className="fl">Paid from which account</label>
                <AccountChips value={accId} onPick={setAccId} />
              </>
            )}

            <label className="fl">Date</label>
            <DateField />

            {!editing && (
              <label className="switch">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                <span>Repeat every month (e.g. rent on day {parseInt(date.slice(8, 10), 10) || 1})</span>
              </label>
            )}
          </>
        )}

        <label className="fl">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={isTransfer ? "e.g. ATM withdrawal" : isIncome ? "e.g. May payroll" : "e.g. weekly market run"} />

        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…"
            : editing ? "Save changes"
            : isTransfer ? "Move money"
            : isIncome ? (repeat ? "Add recurring income" : "Add income")
            : (repeat ? "Add recurring expense" : "Add expense")}
        </button>
        {editing && <button className="btn danger" onClick={remove} disabled={busy}>Delete</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { CURRENCY, todayISO } from "../lib/format.js";
import { useToast } from "../ui/ToastProvider.jsx";

// Add a loan (lent out / borrowed) or record a repayment against an existing loan.
export default function LoanSheet({ open, mode, loan, accounts = [], onClose, onSaved }) {
  const toast = useToast();
  const repaying = mode === "repay";
  const editing = mode === "edit";
  const [isLent, setIsLent] = useState(true);
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [accId, setAccId] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(false);
    if (editing && loan) {
      setIsLent(!!loan.is_lent);
      setCounterparty(loan.counterparty || "");
      setAmount(String(loan.principal ?? ""));
      setAccId(loan.account_id ?? null);
      setDate(loan.started_on || todayISO());
      setDueOn(loan.due_on || "");
      setNote(loan.note || "");
    } else {
      setIsLent(true);
      setCounterparty("");
      setAmount("");
      setAccId(accounts[0]?.id ?? null);
      setDate(todayISO());
      setDueOn("");
      setNote("");
    }
  }, [open, mode, loan, accounts, editing]);

  const isoMinus = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  async function save() {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, ""));
    if (!amt || amt <= 0) { setErr(true); return; }
    if (!repaying && !counterparty.trim()) { toast.error("Who is the loan with? (e.g. Tito Boy, Home Credit)"); return; }
    setBusy(true);
    try {
      if (repaying) {
        await api.addRepayment({ loan_id: loan.id, amount: amt, account_id: accId, note: note.trim(), paid_on: date });
      } else if (editing) {
        await api.updateLoan(loan.id, {
          counterparty: counterparty.trim(), principal: amt,
          account_id: accId, note: note.trim(), started_on: date, due_on: dueOn || null,
        });
      } else {
        await api.addLoan({
          is_lent: isLent, counterparty: counterparty.trim(), principal: amt,
          account_id: accId, note: note.trim(), started_on: date, due_on: dueOn || null,
        });
      }
      toast.success(repaying ? "Repayment recorded" : editing ? "Loan updated" : "Loan added");
      onSaved(date);
    } catch (e) { toast.error(e.message || "Could not save."); }
    finally { setBusy(false); }
  }

  const title = repaying
    ? `Repay ${loan?.is_lent ? "loan to" : "loan from"} ${loan?.counterparty || ""}`.trim()
    : editing ? "Edit loan" : "Add loan";

  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
      <div className={"sheet" + (open ? " open" : "")}>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        <div className="grab" />

        {!repaying && !editing && (
          <div className="seg">
            <button className={isLent ? "on" : ""} onClick={() => setIsLent(true)}>🤝 We lent out</button>
            <button className={!isLent ? "on" : ""} onClick={() => setIsLent(false)}>💳 We borrowed</button>
          </div>
        )}

        <h3>{title}</h3>

        {repaying && (
          <div className="hint" style={{ margin: "-6px 2px 10px" }}>
            Outstanding: {CURRENCY}{Number(loan?.outstanding || 0).toLocaleString("en-US")} of {CURRENCY}{Number(loan?.principal || 0).toLocaleString("en-US")}
          </div>
        )}

        <input
          className="amount-in" inputMode="decimal" placeholder={CURRENCY + "0"}
          value={amount}
          style={err ? { borderColor: "var(--danger)" } : undefined}
          onChange={(e) => { setAmount(e.target.value); setErr(false); }}
          autoFocus
        />

        {!repaying && (
          <>
            <label className="fl">{isLent ? "Who borrowed from us" : "Who we owe"}</label>
            <input value={counterparty} maxLength={40}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder={isLent ? "e.g. Tito Boy" : "e.g. Home Credit"} />
          </>
        )}

        <label className="fl">
          {repaying ? (loan?.is_lent ? "Money received into" : "Paid from") : (isLent ? "Money given from" : "Money received into")}
        </label>
        {accounts.length > 0 ? (
          <div className="chips">
            <button type="button" className={"chip" + (accId === null ? " sel" : "")} onClick={() => setAccId(null)}>— None —</button>
            {accounts.map((a) => (
              <button type="button" key={a.id}
                className={"chip" + (a.id === accId ? " sel" : "")}
                onClick={() => setAccId(a.id)}>{a.icon} {a.name}</button>
            ))}
          </div>
        ) : (
          <div className="hint">No accounts yet — add them in Settings to track cash movement.</div>
        )}
        <div className="hint" style={{ margin: "6px 2px 0" }}>
          {accId === null ? "No cash account will change." : "This account's balance will be updated."}
        </div>

        <label className="fl">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="chips" style={{ marginTop: 6 }}>
          <button type="button" className={"chip" + (date === todayISO() ? " sel" : "")} onClick={() => setDate(todayISO())}>Today</button>
          <button type="button" className={"chip" + (date === isoMinus(1) ? " sel" : "")} onClick={() => setDate(isoMinus(1))}>Yesterday</button>
        </div>

        {!repaying && (
          <>
            <label className="fl">Due date (optional)</label>
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </>
        )}

        <label className="fl">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={repaying ? "e.g. 2nd installment" : "e.g. emergency cash"} />

        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : repaying ? "Record repayment" : editing ? "Save changes" : isLent ? "Add loan we gave" : "Add loan we owe"}
        </button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

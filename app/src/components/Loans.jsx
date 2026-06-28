import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { fmt } from "../lib/format.js";
import { useToast } from "../ui/ToastProvider.jsx";
import { useConfirm } from "../ui/ConfirmProvider.jsx";
import LoanSheet from "./LoanSheet.jsx";

export default function Loans({ accounts = [], refreshKey, onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [loans, setLoans] = useState(null);
  const [sheet, setSheet] = useState({ open: false, mode: "add", loan: null });
  const [expanded, setExpanded] = useState(null);     // loan id whose repayments are shown
  const [reps, setReps] = useState([]);               // repayments of the expanded loan
  const [showSettled, setShowSettled] = useState(false); // reveal fully-repaid loans
  const [actionsFor, setActionsFor] = useState(null); // loan id whose action buttons are revealed
  const [tick, setTick] = useState(0);                // local refresh after mutations

  useEffect(() => {
    let on = true;
    api.getLoans().then((l) => on && setLoans(l)).catch(() => on && setLoans([]));
    return () => { on = false; };
  }, [refreshKey, tick]);

  async function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    try { setReps(await api.getLoanRepayments(id)); } catch { setReps([]); }
  }

  async function delLoan(id) {
    if (!(await confirm({ title: "Delete this loan?", body: "This removes the loan and all its repayments. Linked account balances will be reversed.", danger: true }))) return;
    try { await api.deleteLoan(id); setExpanded(null); setTick((t) => t + 1); onChange && onChange(); toast.success("Loan deleted"); }
    catch (e) { toast.error(e.message || "Could not delete."); }
  }
  async function delRepayment(rid) {
    if (!(await confirm({ title: "Remove this repayment?", danger: true }))) return;
    try { await api.deleteRepayment(rid); setReps(await api.getLoanRepayments(expanded)); setTick((t) => t + 1); onChange && onChange(); toast.success("Repayment removed"); }
    catch (e) { toast.error(e.message || "Could not remove."); }
  }

  function onSaved() {
    setSheet({ open: false, mode: "add", loan: null });
    setExpanded(null);
    setTick((t) => t + 1);
    onChange && onChange();
  }

  if (loans === null) return <div className="center">Loading…</div>;

  const lent = loans.filter((l) => l.is_lent);
  const owed = loans.filter((l) => !l.is_lent);
  const sumOut = (arr) => arr.reduce((s, l) => s + Number(l.outstanding || 0), 0);

  const LoanRow = (l) => {
    const pct = l.principal > 0 ? Math.min(100, (l.repaid / l.principal) * 100) : 0;
    const settled = l.outstanding <= 0;
    return (
      <div className="loan-row" key={l.id}>
        <div className="loan-head">
          <button className="loan-main" onClick={() => toggleExpand(l.id)}>
            <div className="t1">
              {l.counterparty || "—"}
              {settled && <span className="pill" style={{ marginLeft: 6 }}>settled</span>}
              {l.due_on && !settled && <span className="hint" style={{ marginLeft: 6 }}>due {l.due_on}</span>}
            </div>
            <div className="t2">{fmt(l.outstanding)} left · of {fmt(l.principal)}</div>
          </button>
          <div className="loan-actions">
            {actionsFor === l.id ? (
              <>
                {!settled && <button className="mini-btn" onClick={() => { setActionsFor(null); setSheet({ open: true, mode: "repay", loan: l }); }}>Repay</button>}
                <button className="mini-btn ghost" onClick={() => { setActionsFor(null); setSheet({ open: true, mode: "edit", loan: l }); }}>Edit</button>
                <button className="mini-btn danger" onClick={() => { setActionsFor(null); delLoan(l.id); }}>Delete</button>
              </>
            ) : (
              <button className="kebab" aria-label="Show actions" onClick={() => setActionsFor(l.id)}>⋯</button>
            )}
          </div>
        </div>
        <div className="bar-track" style={{ marginTop: 6 }}>
          <div className="bar-fill" style={{ width: pct + "%", background: settled ? "var(--brand)" : "var(--warn)" }} />
        </div>
        {expanded === l.id && (
          <div style={{ marginTop: 8 }}>
            {reps.length === 0 ? (
              <div className="hint" style={{ padding: "4px 0" }}>No repayments yet.</div>
            ) : reps.map((r) => (
              <div className="mgr-row" key={r.id} style={{ padding: "7px 0" }}>
                <div className="nm" style={{ fontSize: 13 }}>{fmt(r.amount)}
                  <div className="hint" style={{ margin: 0 }}>{r.paid_on}{r.note ? " · " + r.note : ""}</div>
                </div>
                <button className="x" onClick={() => delRepayment(r.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const Group = ({ title, items, emptyText }) => {
    const active = items.filter((l) => l.outstanding > 0);
    const settledItems = items.filter((l) => l.outstanding <= 0);
    return (
      <>
        <div className="section-h">
          {title}
          {items.length > 0 && <span className="pill">{fmt(sumOut(items))}</span>}
        </div>
        <div className="card" style={{ padding: "6px 16px" }}>
          {items.length === 0 ? (
            <div className="hint" style={{ padding: "10px 0" }}>{emptyText}</div>
          ) : (
            <>
              {active.length === 0 && !showSettled && (
                <div className="hint" style={{ padding: "10px 0" }}>All settled here. 🎉</div>
              )}
              {active.map(LoanRow)}
              {showSettled && settledItems.map(LoanRow)}
              {settledItems.length > 0 && (
                <button className="link-btn" style={{ padding: "10px 0" }} onClick={() => setShowSettled((s) => !s)}>
                  {showSettled ? "Hide settled" : `Show settled (${settledItems.length})`}
                </button>
              )}
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <button className="btn" style={{ marginBottom: 4 }} onClick={() => setSheet({ open: true, mode: "add", loan: null })}>
        + Add loan
      </button>

      <Group title="Owed to us" items={lent} emptyText="No money lent out. Tap “Add loan” and pick “We lent out”." />
      <Group title="We owe" items={owed} emptyText="No debts tracked. Tap “Add loan” and pick “We borrowed”." />

      <LoanSheet
        open={sheet.open}
        mode={sheet.mode}
        loan={sheet.loan}
        accounts={accounts}
        onClose={() => setSheet({ open: false, mode: "add", loan: null })}
        onSaved={onSaved}
      />
    </>
  );
}

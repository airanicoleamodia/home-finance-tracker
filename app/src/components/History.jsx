import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { fmt, ymKey, MONTHS, hexA } from "../lib/format.js";

export default function History({ cur, categories, members, accounts = [], refreshKey, onEdit }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all"); // all | expense | income | transfer | loans
  const [q, setQ] = useState("");
  const monthKey = ymKey(cur);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const [ex, inc, trf, loansAll] = await Promise.all([
          api.getExpenses(monthKey), api.getIncome(monthKey),
          api.getTransfers(monthKey).catch(() => []), api.getLoans().catch(() => []),
        ]);
        // Loan creations + repayments are cash events shown in the month they happened.
        const repArrays = await Promise.all((loansAll || []).map((l) => api.getLoanRepayments(l.id).catch(() => [])));
        const loanEvents = [];
        (loansAll || []).forEach((l, i) => {
          if ((l.started_on || "").slice(0, 7) === monthKey)
            loanEvents.push({ ...l, _kind: "loan", _date: l.started_on });
          (repArrays[i] || []).forEach((r) => {
            if ((r.paid_on || "").slice(0, 7) === monthKey)
              loanEvents.push({ ...r, _kind: "repay", is_lent: l.is_lent, counterparty: l.counterparty, _date: r.paid_on });
          });
        });
        const merged = [
          ...ex.map((e) => ({ ...e, _kind: "expense", _date: e.spent_on })),
          ...inc.map((e) => ({ ...e, _kind: "income", _date: e.received_on })),
          ...trf.map((t) => ({ ...t, _kind: "transfer", _date: t.moved_on })),
          ...loanEvents,
        ].sort((a, b) => b._date.localeCompare(a._date));
        if (on) setRows(merged);
      } catch { if (on) setRows([]); }
    })();
    return () => { on = false; };
  }, [monthKey, refreshKey]);

  if (rows === null) return <div className="center">Loading…</div>;

  const catOf = (id) => categories.find((c) => c.id === id) || { name: "Uncategorized", icon: "❓", color: "#999" };
  const nameOf = (id) => members.find((m) => m.id === id)?.display_name || "—";
  const accOf = (id) => accounts.find((a) => a.id === id);
  const accName = (id) => { const a = accOf(id); return a ? `${a.icon} ${a.name}` : "—"; };

  const isLoanKind = (k) => k === "loan" || k === "repay";
  const needle = q.trim().toLowerCase();
  const matches = (r) => {
    if (!needle) return true;
    const hay = r._kind === "income" ? `${r.source} ${r.note || ""}`
      : r._kind === "transfer" ? `${accName(r.from_account)} ${accName(r.to_account)} ${r.note || ""}`
      : isLoanKind(r._kind) ? `${r.counterparty || ""} ${r.note || ""}`
      : `${catOf(r.category_id).name} ${r.note || ""}`;
    return hay.toLowerCase().includes(needle);
  };
  const shown = rows.filter((r) =>
    (filter === "all" || r._kind === filter || (filter === "loans" && isLoanKind(r._kind))) && matches(r));

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: "0 0 auto", width: "auto" }}>
          <option value="all">All</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
          <option value="transfer">Transfers</option>
          <option value="loans">Loans</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
      </div>


      <div className="section-h">{MONTHS[cur.getMonth()]} <span className="pill">{shown.length}</span></div>

      {shown.length === 0 ? (
        <div className="card empty"><div className="em">🧾</div><div className="et">Nothing here this month yet.</div></div>
      ) : (
        <div className="card list">
          {shown.map((r) => {
            const d = new Date(r._date + "T00:00:00");
            if (r._kind === "loan" || r._kind === "repay") {
              const inflow = r._kind === "loan" ? !r.is_lent : r.is_lent; // cash coming in?
              const title = r._kind === "loan"
                ? (r.is_lent ? `Lent to ${r.counterparty || "—"}` : `Borrowed from ${r.counterparty || "—"}`)
                : (r.is_lent ? `${r.counterparty || "—"} repaid us` : `Repaid ${r.counterparty || "—"}`);
              const amt = r._kind === "loan" ? r.principal : r.amount;
              const sub = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${r.account_id ? " · " + accName(r.account_id) : ""}${r.note ? " · " + r.note : ""}`;
              return (
                <div className="item" key={r._kind + r.id} style={{ cursor: "default" }}>
                  <div className="ic" style={{ background: hexA("#d97706", 0.14) }}>🤝</div>
                  <div className="it-mid">
                    <div className="t1">{title}<span className="pill" style={{ marginLeft: 6 }}>loan</span></div>
                    <div className="t2">{sub}</div>
                  </div>
                  <div className="it-amt" style={{ color: inflow ? "var(--brand)" : undefined }}>{inflow ? "+" : "−"}{fmt(amt)}</div>
                </div>
              );
            }
            if (r._kind === "transfer") {
              const sub = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${r.note ? " · " + r.note : ""}`;
              return (
                <div className="item" key={r.id} style={{ cursor: "default" }}>
                  <div className="ic" style={{ background: hexA("#6b7280", 0.14) }}>⇄</div>
                  <div className="it-mid">
                    <div className="t1">{accName(r.from_account)} → {accName(r.to_account)}</div>
                    <div className="t2">{sub}</div>
                  </div>
                  <div className="it-amt" style={{ color: "var(--muted)" }}>{fmt(r.amount)}</div>
                </div>
              );
            }
            if (r._kind === "income") {
              const sub = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} · ${nameOf(r.received_by)}${r.recurring ? " · auto" : ""}${r.note ? " · " + r.note : ""}`;
              const clickable = !r.recurring;
              return (
                <button className="item" key={r.id} disabled={!clickable}
                  style={!clickable ? { cursor: "default" } : undefined}
                  onClick={() => clickable && onEdit("income", r)}>
                  <div className="ic" style={{ background: hexA("#0f766e", 0.14) }}>💰</div>
                  <div className="it-mid">
                    <div className="t1">{r.source}{r.recurring && <span className="pill" style={{ marginLeft: 6 }}>monthly</span>}</div>
                    <div className="t2">{sub}</div>
                  </div>
                  <div className="it-amt" style={{ color: "var(--brand)" }}>+{fmt(r.amount)}</div>
                </button>
              );
            }
            const c = catOf(r.category_id);
            const isFee = Boolean(r.transfer_id);
            const clickable = !r.recurring && !isFee;
            const sub = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} · ${nameOf(r.paid_by)}${r.account_id ? " · " + accName(r.account_id) : ""}${r.note ? " · " + r.note : ""}`;
            return (
              <button className="item" key={r.id} disabled={!clickable}
                style={!clickable ? { cursor: "default" } : undefined}
                onClick={() => clickable && onEdit("expense", r)}>
                <div className="ic" style={{ background: hexA(c.color, 0.14) }}>{isFee ? "⇄" : c.icon}</div>
                <div className="it-mid">
                  <div className="t1">{c.name}
                    {r.recurring && <span className="pill" style={{ marginLeft: 6 }}>monthly</span>}
                    {isFee && <span className="pill" style={{ marginLeft: 6 }}>transfer fee</span>}
                  </div>
                  <div className="t2">{sub}</div>
                </div>
                <div className="it-amt">−{fmt(r.amount)}</div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

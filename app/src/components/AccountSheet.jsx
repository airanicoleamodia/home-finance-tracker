import { useEffect, useRef, useState } from "react";
import { api } from "../lib/store.js";
import { fmt, MONTHS, hexA } from "../lib/format.js";
import { useFocusTrap } from "../ui/useFocusTrap.js";

// Shows every transaction that touched ONE account for the given month.
export default function AccountSheet({ open, account, monthKey, categories = [], onClose }) {
  const [rows, setRows] = useState(null);
  const sheetRef = useRef(null);
  useFocusTrap(sheetRef, open);

  useEffect(() => {
    if (!open || !account) { setRows(null); return; }
    let on = true;
    (async () => {
      try {
        const id = account.id;
        const [ex, inc, trf, loans] = await Promise.all([
          api.getExpenses(monthKey), api.getIncome(monthKey),
          api.getTransfers(monthKey).catch(() => []), api.getLoans().catch(() => []),
        ]);
        const repArrays = await Promise.all((loans || []).map((l) => api.getLoanRepayments(l.id).catch(() => [])));
        const catOf = (cid) => categories.find((c) => c.id === cid) || { name: "Uncategorized", icon: "❓", color: "#999" };
        const out = [];
        ex.forEach((e) => { if (e.account_id === id) { const c = catOf(e.category_id); out.push({ key: "e" + e.id, date: e.spent_on, icon: c.icon, color: c.color, label: c.name, note: e.note, delta: -Number(e.amount) }); } });
        inc.forEach((e) => { if (e.account_id === id) out.push({ key: "i" + e.id, date: e.received_on, icon: "💰", color: "#0f766e", label: e.source, note: e.note, delta: +Number(e.amount) }); });
        trf.forEach((t) => {
          if (t.from_account === id) out.push({ key: "to" + t.id, date: t.moved_on, icon: "⇄", color: "#6b7280", label: "Transfer out", note: t.note, delta: -Number(t.amount) });
          if (t.to_account === id) out.push({ key: "ti" + t.id, date: t.moved_on, icon: "⇄", color: "#6b7280", label: "Transfer in", note: t.note, delta: +Number(t.amount) });
        });
        (loans || []).forEach((l, i) => {
          if (l.account_id === id && (l.started_on || "").slice(0, 7) === monthKey)
            out.push({ key: "l" + l.id, date: l.started_on, icon: "🤝", color: "#d97706", label: l.is_lent ? `Lent to ${l.counterparty}` : `Borrowed from ${l.counterparty}`, delta: l.is_lent ? -Number(l.principal) : +Number(l.principal) });
          (repArrays[i] || []).forEach((r) => {
            if (r.account_id === id && (r.paid_on || "").slice(0, 7) === monthKey)
              out.push({ key: "r" + r.id, date: r.paid_on, icon: "🤝", color: "#d97706", label: l.is_lent ? `${l.counterparty} repaid` : `Repaid ${l.counterparty}`, note: r.note, delta: l.is_lent ? +Number(r.amount) : -Number(r.amount) });
          });
        });
        out.sort((a, b) => b.date.localeCompare(a.date));
        if (on) setRows(out);
      } catch { if (on) setRows([]); }
    })();
    return () => { on = false; };
  }, [open, account, monthKey, categories]);

  const net = (rows || []).reduce((s, r) => s + r.delta, 0);
  const [y, m] = (monthKey || "").split("-").map(Number);
  const monthLabel = m ? `${MONTHS[m - 1]} ${y}` : "";

  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
      <div className={"sheet" + (open ? " open" : "")} ref={sheetRef} role="dialog" aria-modal="true" aria-label={(account?.name || "Account") + " — " + monthLabel}>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        <div className="grab" />

        {account && (
          <>
            <h3 style={{ marginBottom: 4 }}>{account.icon} {account.name}</h3>
            <div className="hint" style={{ margin: "0 2px 12px" }}>
              Balance {fmt(account.balance)} · {monthLabel} change {net >= 0 ? "+" : "−"}{fmt(Math.abs(net))}
            </div>

            {rows === null ? (
              <div className="center" style={{ padding: 20 }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div className="card empty"><div className="em">📭</div><div className="et">No transactions for this account in {monthLabel}.</div></div>
            ) : (
              <div className="card list">
                {rows.map((r) => {
                  const d = new Date(r.date + "T00:00:00");
                  const sub = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${r.note ? " · " + r.note : ""}`;
                  return (
                    <div className="item" key={r.key} style={{ cursor: "default" }}>
                      <div className="ic" style={{ background: hexA(r.color, 0.14) }}>{r.icon}</div>
                      <div className="it-mid"><div className="t1">{r.label}</div><div className="t2">{sub}</div></div>
                      <div className="it-amt" style={{ color: r.delta >= 0 ? "var(--brand)" : undefined }}>
                        {r.delta >= 0 ? "+" : "−"}{fmt(Math.abs(r.delta))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="hint" style={{ marginTop: 12 }}>Showing {monthLabel}. Change the month from the dashboard to see other periods.</div>
          </>
        )}

        <button className="btn ghost" onClick={onClose} style={{ marginTop: 12 }}>Close</button>
      </div>
    </>
  );
}

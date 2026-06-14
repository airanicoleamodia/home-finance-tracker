import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { fmt, ymKey, MONTHS, hexA } from "../lib/format.js";

export default function History({ cur, categories, members, accounts = [], refreshKey, onEdit }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all"); // all | expense | income | transfer
  const [q, setQ] = useState("");
  const monthKey = ymKey(cur);

  useEffect(() => {
    let on = true;
    Promise.all([api.getExpenses(monthKey), api.getIncome(monthKey), api.getTransfers(monthKey).catch(() => [])])
      .then(([ex, inc, trf]) => {
        if (!on) return;
        const merged = [
          ...ex.map((e) => ({ ...e, _kind: "expense", _date: e.spent_on })),
          ...inc.map((e) => ({ ...e, _kind: "income", _date: e.received_on })),
          ...trf.map((t) => ({ ...t, _kind: "transfer", _date: t.moved_on })),
        ].sort((a, b) => b._date.localeCompare(a._date));
        setRows(merged);
      })
      .catch(() => on && setRows([]));
    return () => { on = false; };
  }, [monthKey, refreshKey]);

  if (rows === null) return <div className="center">Loading…</div>;

  const catOf = (id) => categories.find((c) => c.id === id) || { name: "Uncategorized", icon: "❓", color: "#999" };
  const nameOf = (id) => members.find((m) => m.id === id)?.display_name || "—";
  const accOf = (id) => accounts.find((a) => a.id === id);
  const accName = (id) => { const a = accOf(id); return a ? `${a.icon} ${a.name}` : "—"; };

  const needle = q.trim().toLowerCase();
  const matches = (r) => {
    if (!needle) return true;
    const hay = r._kind === "income" ? `${r.source} ${r.note || ""}`
      : r._kind === "transfer" ? `${accName(r.from_account)} ${accName(r.to_account)} ${r.note || ""}`
      : `${catOf(r.category_id).name} ${r.note || ""}`;
    return hay.toLowerCase().includes(needle);
  };
  const shown = rows.filter((r) => (filter === "all" || r._kind === filter) && matches(r));

  return (
    <>
      <div className="seg seg-3" style={{ marginBottom: 10 }}>
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All</button>
        <button className={filter === "income" ? "on income" : ""} onClick={() => setFilter("income")}>Income</button>
        <button className={filter === "expense" ? "on" : ""} onClick={() => setFilter("expense")}>Expenses</button>
        <button className={filter === "transfer" ? "on" : ""} onClick={() => setFilter("transfer")}>Transfers</button>
      </div>

      <input style={{ marginBottom: 14 }} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search note, category, source…" />


      <div className="section-h">{MONTHS[cur.getMonth()]} <span className="pill">{shown.length}</span></div>

      {shown.length === 0 ? (
        <div className="card empty"><div className="em">🧾</div><div className="et">Nothing here this month yet.</div></div>
      ) : (
        <div className="card list">
          {shown.map((r) => {
            const d = new Date(r._date + "T00:00:00");
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
            const clickable = !r.recurring;
            const sub = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} · ${nameOf(r.paid_by)}${r.account_id ? " · " + accName(r.account_id) : ""}${r.note ? " · " + r.note : ""}`;
            return (
              <button className="item" key={r.id} disabled={!clickable}
                style={!clickable ? { cursor: "default" } : undefined}
                onClick={() => clickable && onEdit("expense", r)}>
                <div className="ic" style={{ background: hexA(c.color, 0.14) }}>{c.icon}</div>
                <div className="it-mid">
                  <div className="t1">{c.name}{r.recurring && <span className="pill" style={{ marginLeft: 6 }}>monthly</span>}</div>
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

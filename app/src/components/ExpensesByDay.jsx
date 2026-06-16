import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { fmt, MONTHS, hexA, todayISO, shiftISO } from "../lib/format.js";

// Day-at-a-time view of expenses. Defaults to the current date and lets you
// step backward/forward a day at a time (or jump back to "Today").
export default function ExpensesByDay({ categories, members, accounts = [], refreshKey, onEdit }) {
  const [day, setDay] = useState(todayISO()); // YYYY-MM-DD, defaults to today
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const ex = await api.getExpensesByDay(day);
        if (on) setRows(ex);
      } catch { if (on) setRows([]); }
    })();
    return () => { on = false; };
  }, [day, refreshKey]);

  const catOf = (id) => categories.find((c) => c.id === id) || { name: "Uncategorized", icon: "❓", color: "#999" };
  const nameOf = (id) => members.find((m) => m.id === id)?.display_name || "—";
  const accOf = (id) => accounts.find((a) => a.id === id);
  const accName = (id) => { const a = accOf(id); return a ? `${a.icon} ${a.name}` : "—"; };

  const d = new Date(day + "T00:00:00");
  const isToday = day === todayISO();
  const dayLabel = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const total = (rows || []).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      {/* Day navigator — prev / current day / next */}
      <div className="month">
        <button onClick={() => setDay((x) => shiftISO(x, -1))} aria-label="Previous day">‹</button>
        <div className="label">{isToday ? "Today" : dayLabel}</div>
        <button onClick={() => setDay((x) => shiftISO(x, 1))} aria-label="Next day">›</button>
      </div>

      <div className="chips" style={{ marginTop: 10 }}>
        <button type="button" className={"chip" + (isToday ? " sel" : "")} onClick={() => setDay(todayISO())}>Today</button>
        <button type="button" className={"chip" + (day === shiftISO(todayISO(), -1) ? " sel" : "")} onClick={() => setDay(shiftISO(todayISO(), -1))}>Yesterday</button>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ flex: "0 0 auto", width: "auto" }} />
      </div>

      <div className="section-h">
        {isToday ? "Today" : dayLabel}
        <span className="pill">{fmt(total)}</span>
      </div>

      {rows === null ? (
        <div className="center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card empty"><div className="em">🪙</div>
          <div className="et">No expenses on this day.<br />Tap + to add one.</div></div>
      ) : (
        <div className="card list">
          {rows.map((r) => {
            const c = catOf(r.category_id);
            const isFee = Boolean(r.transfer_id);
            const clickable = !r.recurring && !isFee;
            const itemLabel = (it) => typeof it === "string" ? it : `${it.name}${it.amount ? " " + fmt(it.amount) : ""}`;
            const itemsTxt = Array.isArray(r.items) && r.items.length ? " · 📋 " + r.items.map(itemLabel).join(", ") : "";
            const sub = `${nameOf(r.paid_by)}${r.account_id ? " · " + accName(r.account_id) : ""}${r.note ? " · " + r.note : ""}${itemsTxt}`;
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

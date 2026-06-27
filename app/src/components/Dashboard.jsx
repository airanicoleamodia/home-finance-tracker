import { useEffect, useState } from "react";
import { api, weeklyExpenseTotals } from "../lib/store.js";
import { fmt, ymKey, MONTHS, PALETTE, hexA, todayISO, shiftISO } from "../lib/format.js";
import AccountSheet from "./AccountSheet.jsx";

export default function Dashboard({ cur, categories, refreshKey }) {
  const [data, setData] = useState(null);
  const [acctSheet, setAcctSheet] = useState(null); // account whose ledger is open
  const monthKey = ymKey(cur);

  useEffect(() => {
    let on = true;
    Promise.all([
      api.getExpenses(monthKey),
      api.getIncome(monthKey),
      api.getMonthlyTotals(monthKey, 6),
      api.getAccounts().catch(() => []), // non-fatal: DB migration may not be applied yet
      api.getLoans().catch(() => []),
    ])
      .then(([expenses, income, trend, accounts, loans]) => on && setData({ expenses, income, trend, accounts, loans }))
      .catch(() => on && setData({ expenses: [], income: [], trend: [], accounts: [], loans: [] }));
    return () => { on = false; };
  }, [monthKey, refreshKey]);

  if (data === null) return <div className="center">Loading…</div>;

  const { expenses, income, trend, accounts, loans } = data;
  const catOf = (id) => categories.find((c) => c.id === id) || { name: "Uncategorized", icon: "❓", color: "#999" };
  const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalInc = income.reduce((s, e) => s + Number(e.amount), 0);
  const net = totalInc - totalExp;

  return (
    <>
      {/* Side-by-side summary + net */}
      <div className="card sum-card">
        <div className="sum-row">
          <div className="sum-cell">
            <div className="lbl">Income</div>
            <div className="val pos">{fmt(totalInc)}</div>
          </div>
          <div className="sum-div" />
          <div className="sum-cell">
            <div className="lbl">Spent</div>
            <div className="val neg">{fmt(totalExp)}</div>
          </div>
        </div>
        <div className={"net " + (net >= 0 ? "pos" : "neg")}>
          <span>Balance</span>
          <strong>{net >= 0 ? "" : "−"}{fmt(Math.abs(net))}</strong>
        </div>
        <div className="meta">{MONTHS[cur.getMonth()]} {cur.getFullYear()} · {income.length} income · {expenses.length} expense{expenses.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Where the money is — manual account balances */}
      <div className="section-h">
        Where your money is
        {(accounts || []).length > 0 && (
          <span className="pill">{fmt((accounts || []).reduce((s, a) => s + Number(a.balance || 0), 0))}</span>
        )}
      </div>
      <div className="card" style={{ padding: "6px 16px" }}>
        {(accounts || []).length === 0 ? (
          <div className="hint" style={{ padding: "10px 0" }}>
            No accounts yet. Add your bank, e-wallet or cash in <strong>Settings</strong> to track where your money sits.
          </div>
        ) : (
          accounts.map((a) => (
            <button className="mgr-row acct-row" key={a.id} onClick={() => setAcctSheet(a)} title="View transactions">
              <div className="ic" style={{ width: 32, height: 32, borderRadius: 9, fontSize: 16, background: "#f0f2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>{a.icon}</div>
              <div className="nm">{a.name}</div>
              <strong className="acc-bal">{fmt(a.balance)}</strong>
              <span className="chev">›</span>
            </button>
          ))
        )}
      </div>

      <AccountSheet
        open={!!acctSheet}
        account={acctSheet}
        monthKey={monthKey}
        categories={categories}
        onClose={() => setAcctSheet(null)}
      />

      <NetWorth accounts={accounts} loans={loans} />

      {expenses.length === 0 ? (
        <div className="card empty" style={{ marginTop: 16 }}><div className="em">🪙</div>
          <div className="et">No expenses yet this month.<br />Tap + to add income or an expense.</div></div>
      ) : (
        <>
          <div className="section-h">Spending by category</div>
          <SpendByCategory expenses={expenses} total={totalExp} catOf={catOf} />

          <div className="section-h">Spending by account</div>
          <SpendByAccount expenses={expenses} accounts={accounts} />

          <div className="section-h">Weekly spending</div>
          <WeeklyBars expenses={expenses} monthKey={monthKey} />
        </>
      )}

      {/* Daily spending — rolling 7-day window, independent of the selected month */}
      <div className="section-h">Daily spending</div>
      <DailyBars refreshKey={refreshKey} />

      {/* Trends */}
      <div className="section-h">6-month trend</div>
      <Trend trend={trend} />
    </>
  );
}

function NetWorth({ accounts, loans }) {
  const cash = (accounts || []).reduce((s, a) => s + Number(a.balance || 0), 0);
  const receivable = (loans || []).filter((l) => l.is_lent).reduce((s, l) => s + Number(l.outstanding || 0), 0);
  const payable = (loans || []).filter((l) => !l.is_lent).reduce((s, l) => s + Number(l.outstanding || 0), 0);
  if (!receivable && !payable) return null; // nothing loan-related yet — keep the dashboard clean
  const net = cash + receivable - payable;
  const Row = ({ label, value, color, bold }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0", fontWeight: bold ? 800 : 400 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <strong style={{ color: color || "var(--ink)" }}>{value}</strong>
    </div>
  );
  return (
    <>
      <div className="section-h">Net worth</div>
      <div className="card" style={{ padding: 14 }}>
        <Row label="Cash in accounts" value={fmt(cash)} />
        {receivable > 0 && <Row label="Owed to us" value={"+" + fmt(receivable)} color="var(--brand)" />}
        {payable > 0 && <Row label="We owe" value={"−" + fmt(payable)} color="var(--danger)" />}
        <div style={{ borderTop: "1px solid var(--line)", margin: "8px 0" }} />
        <Row label="Net worth" value={fmt(net)} bold />
      </div>
    </>
  );
}

function SpendByCategory({ expenses, total, catOf }) {
  if (!expenses.length || total <= 0) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div className="hint" style={{ padding: "6px 0" }}>No expenses to chart this month.</div>
      </div>
    );
  }
  const by = {};
  expenses.forEach((e) => { by[e.category_id] = (by[e.category_id] || 0) + Number(e.amount); });
  const groups = Object.entries(by)
    .map(([id, v]) => ({ id, v, c: catOf(id) }))
    .sort((a, b) => b.v - a.v);

  const R = 54, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = groups.map((g, i) => {
    const frac = g.v / total;
    const s = { ...g, col: g.c.color || PALETTE[i % PALETTE.length], len: frac * C, off: C - acc * C };
    acc += frac;
    return s;
  });

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Spending by category" style={{ flex: "0 0 auto" }}>
          <circle r={R} cx="60" cy="60" fill="none" stroke="#eef1f0" strokeWidth="14" />
          {segs.map((s, i) => (
            <circle key={i} r={R} cx="60" cy="60" fill="none" stroke={s.col} strokeWidth="14"
              strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={s.off}
              transform="rotate(-90 60 60)" strokeLinecap="butt" />
          ))}
          <text x="60" y="56" textAnchor="middle" fontSize="11" fill="#6b7a77">Total</text>
          <text x="60" y="72" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">{fmt(total)}</text>
        </svg>
        <div style={{ flex: "1 1 160px", minWidth: 160, display: "flex", flexDirection: "column", gap: 8 }}>
          {segs.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: s.col, flex: "0 0 auto" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.c.icon} {s.c.name}</span>
              <strong style={{ flex: "0 0 auto" }}>{fmt(s.v)}</strong>
              <span style={{ flex: "0 0 auto", color: "#6b7a77", fontSize: 12, width: 34, textAlign: "right" }}>{Math.round((s.v / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpendByAccount({ expenses, accounts }) {
  if (!expenses.length) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div className="hint" style={{ padding: "6px 0" }}>No expenses to chart this month.</div>
      </div>
    );
  }
  const accOf = (id) => (accounts || []).find((a) => a.id === id);
  const by = {};
  expenses.forEach((e) => {
    const key = e.account_id == null ? "__none__" : e.account_id;
    by[key] = (by[key] || 0) + Number(e.amount);
  });
  const rows = Object.entries(by)
    .map(([key, v], i) => {
      const a = key === "__none__" ? null : accOf(key);
      return {
        key,
        v,
        name: a ? a.name : "Unassigned",
        icon: a ? a.icon : "🗂️",
        color: (a && a.color) || PALETTE[i % PALETTE.length],
      };
    })
    .sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...rows.map((r) => r.v));

  return (
    <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => (
        <div key={r.key}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.icon} {r.name}</span>
            <strong style={{ flex: "0 0 auto", marginLeft: 8 }}>{fmt(r.v)}</strong>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: hexA(r.color, 0.14), overflow: "hidden" }}>
            <div style={{ height: "100%", width: Math.max(4, (r.v / max) * 100) + "%", borderRadius: 6, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Rolling 7-day spending chart. Defaults to the week ending today and lets you
// page back a week at a time (forward is capped at today).
function DailyBars({ refreshKey }) {
  const [endDay, setEndDay] = useState(todayISO());
  const [days, setDays] = useState(null);

  useEffect(() => {
    let on = true;
    api.getDailyTotals(endDay, 7)
      .then((d) => on && setDays(d))
      .catch(() => on && setDays([]));
    return () => { on = false; };
  }, [endDay, refreshKey]);

  const atToday = endDay >= todayISO();
  const dayLabel = (iso) => { const d = new Date(iso + "T00:00:00"); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
  const startDay = shiftISO(endDay, -6);

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="month" style={{ marginTop: 0 }}>
        <button onClick={() => setEndDay((x) => shiftISO(x, -7))} aria-label="Previous 7 days">‹</button>
        <div className="label">{dayLabel(startDay)} – {dayLabel(endDay)}</div>
        <button onClick={() => setEndDay((x) => shiftISO(x, 7))} disabled={atToday} aria-label="Next 7 days"
          style={atToday ? { opacity: 0.4, cursor: "default" } : undefined}>›</button>
      </div>

      {days === null ? (
        <div className="center" style={{ padding: "20px 0" }}>Loading…</div>
      ) : (() => {
        const total = days.reduce((s, d) => s + d.expense, 0);
        if (total <= 0) {
          return <div className="hint" style={{ padding: "10px 0 2px" }}>No spending in these 7 days.</div>;
        }
        const max = Math.max(1, ...days.map((d) => d.expense));
        const W = 320, H = 140, pad = 22, bw = (W - pad * 2) / days.length;
        return (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" role="img" aria-label="Daily spending">
              {days.map((d, i) => {
                const x = pad + i * bw;
                const h = (d.expense / max) * (H - 42);
                const bar = bw * 0.5;
                return (
                  <g key={i}>
                    <rect x={x + (bw - bar) / 2} y={H - 22 - h} width={bar} height={h} rx="3" fill="#0f766e" />
                    <text x={x + bw * 0.5} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b7a77">
                      {WEEKDAYS[new Date(d.day + "T00:00:00").getDay()]}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="legend-inline">
              <span><i style={{ background: "#0f766e" }} /> Spent · {fmt(total)}</span>
            </div>
          </>
        );
      })()}
    </div>
  );
}

function WeeklyBars({ expenses, monthKey }) {
  const weeks = weeklyExpenseTotals(expenses, monthKey);
  const total = weeks.reduce((s, w) => s + w.total, 0);
  if (total <= 0) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div className="hint" style={{ padding: "6px 0" }}>No expenses to chart this month.</div>
      </div>
    );
  }
  const max = Math.max(1, ...weeks.map((w) => w.total));
  const W = 320, H = 140, pad = 22, bw = (W - pad * 2) / weeks.length;
  return (
    <div className="card" style={{ padding: 14 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" role="img" aria-label="Weekly spending">
        {weeks.map((w, i) => {
          const x = pad + i * bw;
          const h = (w.total / max) * (H - 42);
          const bar = bw * 0.5;
          return (
            <g key={i}>
              <rect x={x + (bw - bar) / 2} y={H - 22 - h} width={bar} height={h} rx="3" fill="#0f766e" />
              <text x={x + bw * 0.5} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b7a77">{w.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend-inline">
        <span><i style={{ background: "#0f766e" }} /> Spent · {fmt(total)}</span>
      </div>
    </div>
  );
}

function Trend({ trend }) {
  if (!trend || !trend.length) return null;
  const max = Math.max(1, ...trend.map((t) => Math.max(t.income, t.expense)));
  const W = 320, H = 140, pad = 22, bw = (W - pad * 2) / trend.length;
  return (
    <div className="card" style={{ padding: 14 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" role="img" aria-label="Income vs expense trend">
        {trend.map((t, i) => {
          const x = pad + i * bw;
          const ih = (t.income / max) * (H - 42);
          const eh = (t.expense / max) * (H - 42);
          const w = bw * 0.32;
          return (
            <g key={i}>
              <rect x={x + bw * 0.18} y={H - 22 - ih} width={w} height={ih} rx="3" fill="#0f766e" />
              <rect x={x + bw * 0.5} y={H - 22 - eh} width={w} height={eh} rx="3" fill="#cbd5d2" />
              <text x={x + bw * 0.5} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b7a77">
                {MONTHS[(t.month.split("-")[1] - 1)].slice(0, 1)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend-inline">
        <span><i style={{ background: "#0f766e" }} /> Income</span>
        <span><i style={{ background: "#cbd5d2" }} /> Spent</span>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { fmt, ymKey, MONTHS, PALETTE, hexA } from "../lib/format.js";

export default function Dashboard({ cur, categories, refreshKey }) {
  const [data, setData] = useState(null);
  const monthKey = ymKey(cur);

  useEffect(() => {
    let on = true;
    Promise.all([
      api.getExpenses(monthKey),
      api.getIncome(monthKey),
      api.getMonthlyTotals(monthKey, 6),
      api.getAccounts().catch(() => []), // non-fatal: DB migration may not be applied yet
    ])
      .then(([expenses, income, trend, accounts]) => on && setData({ expenses, income, trend, accounts }))
      .catch(() => on && setData({ expenses: [], income: [], trend: [], accounts: [] }));
    return () => { on = false; };
  }, [monthKey, refreshKey]);

  if (data === null) return <div className="center">Loading…</div>;

  const { expenses, income, trend, accounts } = data;
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
            <div className="mgr-row" key={a.id}>
              <div className="ic" style={{ width: 32, height: 32, borderRadius: 9, fontSize: 16, background: "#f0f2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>{a.icon}</div>
              <div className="nm">{a.name}</div>
              <strong className="acc-bal">{fmt(a.balance)}</strong>
            </div>
          ))
        )}
      </div>

      {expenses.length === 0 ? (
        <div className="card empty" style={{ marginTop: 16 }}><div className="em">🪙</div>
          <div className="et">No expenses yet this month.<br />Tap + to add income or an expense.</div></div>
      ) : (
        <>
          <div className="section-h">Spending by category</div>
          <SpendByCategory expenses={expenses} total={totalExp} catOf={catOf} />

          <div className="section-h">Spending by account</div>
          <SpendByAccount expenses={expenses} accounts={accounts} />
        </>
      )}

      {/* Trends */}
      <div className="section-h">6-month trend</div>
      <Trend trend={trend} />
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

import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { fmt, ymKey, MONTHS, PALETTE } from "../lib/format.js";

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

      {/* Trends */}
      <div className="section-h">6-month trend</div>
      <Trend trend={trend} />

      {/* Category breakdown */}
      {expenses.length === 0 ? (
        <div className="card empty" style={{ marginTop: 16 }}><div className="em">🪙</div>
          <div className="et">No expenses yet this month.<br />Tap + to add income or an expense.</div></div>
      ) : (
        <Breakdown expenses={expenses} total={totalExp} catOf={catOf} />
      )}
    </>
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

function Breakdown({ expenses, total, catOf }) {
  const by = {};
  expenses.forEach((e) => { by[e.category_id] = (by[e.category_id] || 0) + Number(e.amount); });
  const groups = Object.entries(by).map(([id, v]) => ({ id, v, c: catOf(id) })).sort((a, b) => b.v - a.v);

  let acc = 0;
  const R = 54, C = 2 * Math.PI * R;
  const segs = groups.map((g, i) => {
    const frac = g.v / total;
    const s = { ...g, col: g.c.color || PALETTE[i % PALETTE.length], len: frac * C, off: C - acc * C };
    acc += frac; return s;
  });
  const max = groups[0].v;

  return (
    <>
      <div className="section-h">Where the money went</div>
      <div className="card">
        <div className="chart-wrap">
          <svg className="donut" viewBox="0 0 120 120" width="120" height="120">
            <circle r={R} cx="60" cy="60" fill="none" stroke="#eef1f0" strokeWidth="14" />
            {segs.map((s, i) => (
              <circle key={i} r={R} cx="60" cy="60" fill="none" stroke={s.col} strokeWidth="14"
                strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={s.off}
                transform="rotate(-90 60 60)" />
            ))}
            <text x="60" y="58" textAnchor="middle" fontSize="20">{groups[0].c.icon}</text>
            <text x="60" y="74" textAnchor="middle" fontSize="9" fill="#6b7a77">top</text>
          </svg>
          <div className="legend">
            {segs.slice(0, 6).map((s, i) => (
              <div className="legend-row" key={i}>
                <span className="sw" style={{ background: s.col }} />
                <span className="nm">{s.c.icon} {s.c.name}</span>
                <span className="vl">{fmt(s.v)}</span>
                <span className="pc">{Math.round((s.v / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-h">By category</div>
      <div className="card cat-bars">
        {groups.map((g) => (
          <div className="bar-row" key={g.id}>
            <div className="bar-top"><span className="nm">{g.c.icon} {g.c.name}</span><span className="vl">{fmt(g.v)}</span></div>
            <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(4, (g.v / max) * 100) + "%", background: g.c.color }} /></div>
          </div>
        ))}
      </div>
    </>
  );
}

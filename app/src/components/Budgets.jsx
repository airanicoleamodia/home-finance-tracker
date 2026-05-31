import { useEffect, useState } from "react";
import { api } from "../lib/store.js";
import { fmt, ymKey, MONTHS } from "../lib/format.js";

export default function Budgets({ cur, categories, refreshKey, onChange }) {
  const monthKey = ymKey(cur);
  const [budgets, setBudgets] = useState(null);
  const [spent, setSpent] = useState({});
  const [drafts, setDrafts] = useState({});

  async function reload() {
    const [b, ex] = await Promise.all([api.getBudgets(monthKey), api.getExpenses(monthKey)]);
    const s = {};
    ex.forEach((e) => { s[e.category_id] = (s[e.category_id] || 0) + Number(e.amount); });
    setSpent(s);
    setBudgets(b);
    const d = {};
    b.forEach((x) => { d[x.category_id] = String(x.amount); });
    setDrafts(d);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [monthKey, refreshKey]);

  if (budgets === null) return <div className="center">Loading…</div>;

  const limitOf = (id) => budgets.find((b) => b.category_id === id)?.amount ?? null;

  async function saveLimit(id) {
    const v = parseFloat(String(drafts[id] || "").replace(/[^0-9.]/g, ""));
    if (!v || v <= 0) { await api.clearBudget(id, monthKey); }
    else { await api.setBudget(id, monthKey, v); }
    await reload(); onChange && onChange();
  }

  const withBudget = categories.filter((c) => limitOf(c.id) != null);
  const without = categories.filter((c) => limitOf(c.id) == null);

  return (
    <>
      <div className="section-h">Budgets · {MONTHS[cur.getMonth()]}</div>
      <div className="hint" style={{ margin: "0 4px 12px" }}>
        Set a monthly limit per category. Bars turn orange near the limit and red when over.
      </div>

      <div className="card">
        {withBudget.length === 0 && (
          <div className="empty" style={{ padding: "30px 20px" }}>
            <div className="em">🎯</div><div className="et">No budgets set for this month yet.<br />Add one below.</div>
          </div>
        )}
        {withBudget.map((c) => {
          const limit = limitOf(c.id);
          const used = spent[c.id] || 0;
          const pct = limit ? (used / limit) * 100 : 0;
          const cls = pct >= 100 ? "over" : pct >= 80 ? "near" : "";
          const barCol = pct >= 100 ? "var(--danger)" : pct >= 80 ? "var(--warn)" : c.color;
          return (
            <div className="budget-row" key={c.id}>
              <div className="budget-top">
                <span>{c.icon} {c.name}</span>
                <span className="spent">
                  <span className={cls}>{fmt(used)}</span> / {fmt(limit)}
                </span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: Math.min(100, pct) + "%", background: barCol }} />
              </div>
              <div className="budget-set">
                <input inputMode="decimal" value={drafts[c.id] ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                  placeholder="Limit" />
                <button onClick={() => saveLimit(c.id)}
                  style={{ border: "none", background: "var(--brand)", color: "#fff", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>
                  Save
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {without.length > 0 && (
        <>
          <div className="section-h">Add a budget</div>
          <div className="card">
            {without.map((c) => (
              <div className="budget-row" key={c.id}>
                <div className="budget-top"><span>{c.icon} {c.name}</span>
                  <span className="spent">spent {fmt(spent[c.id] || 0)}</span></div>
                <div className="budget-set">
                  <input inputMode="decimal" value={drafts[c.id] ?? ""}
                    onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                    placeholder="Set monthly limit" />
                  <button onClick={() => saveLimit(c.id)}
                    style={{ border: "none", background: "var(--brand)", color: "#fff", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>
                    Set
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/store.js";
import { CURRENCY, todayISO } from "../lib/format.js";

// Handles both EXPENSE and INCOME entries (add + edit), plus recurring income.
export default function ExpenseSheet({ open, kind: initialKind, entry, categories, members, onClose, onSaved }) {
  const editing = Boolean(entry);
  const [kind, setKind] = useState("expense"); // "expense" | "income"
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState(null);
  const [source, setSource] = useState("Salary");
  const [who, setWho] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  // Drag-to-close gesture
  const sheetRef = useRef(null);
  const drag = useRef({ startY: null, active: false });
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Reset any in-progress drag whenever the sheet opens/closes.
  useEffect(() => {
    setDragY(0);
    setDragging(false);
    drag.current = { startY: null, active: false };
  }, [open]);

  function onPointerDown(e) {
    // Don't hijack interactions with form fields.
    if (e.target.closest("input, textarea, select")) { drag.current.startY = null; return; }
    if (e.pointerType === "mouse" && e.button !== 0) { drag.current.startY = null; return; }
    drag.current = { startY: e.clientY, active: false };
  }

  function onPointerMove(e) {
    if (drag.current.startY == null) return;
    const dy = e.clientY - drag.current.startY;
    const atTop = (sheetRef.current?.scrollTop || 0) <= 0;
    // Begin a close-drag only when pulling down from the top of the sheet.
    if (!drag.current.active) {
      if (dy > 6 && atTop) {
        drag.current.active = true;
        setDragging(true);
        sheetRef.current?.setPointerCapture?.(e.pointerId);
      } else {
        return;
      }
    }
    if (dy <= 0) { setDragY(0); return; }
    // Light resistance so the drag feels anchored.
    setDragY(dy);
  }

  function endDrag() {
    if (!drag.current.active) { drag.current.startY = null; return; }
    drag.current.active = false;
    drag.current.startY = null;
    setDragging(false);
    const sheetH = sheetRef.current?.offsetHeight || 600;
    // Close when dragged past ~25% of the sheet height (or 120px, whichever is less).
    if (dragY > Math.min(sheetH * 0.25, 120)) {
      setDragY(0);
      onClose();
    } else {
      setDragY(0);
    }
  }

  useEffect(() => {
    if (!open) return;
    const k = editing ? initialKind : initialKind || "expense";
    setKind(k);
    setErr(false);
    setRepeat(false);
    setAmount(entry ? String(entry.amount) : "");
    setCatId(entry && k === "expense" ? entry.category_id : categories[0]?.id ?? null);
    setSource(entry && k === "income" ? entry.source || "Income" : "Salary");
    setWho(entry ? (k === "expense" ? entry.paid_by : entry.received_by) : members[0]?.id ?? null);
    setDate(entry ? (k === "expense" ? entry.spent_on : entry.received_on) : todayISO());
    setNote(entry ? entry.note || "" : "");
  }, [open, entry, initialKind, categories, members, editing]);

  async function save() {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, ""));
    if (!amt || amt <= 0) { setErr(true); return; }
    setBusy(true);
    try {
      if (kind === "expense") {
        const payload = { amount: amt, category_id: catId, paid_by: who, note: note.trim(), spent_on: date };
        if (editing) await api.updateExpense(entry.id, payload);
        else await api.addExpense(payload);
      } else {
        // income
        if (!editing && repeat) {
          const day = parseInt(date.slice(8, 10), 10) || 1;
          await api.addRecurringIncome({
            amount: amt, source: source.trim() || "Salary", day_of_month: day,
            received_by: who, note: note.trim(), start_month: date.slice(0, 7),
          });
        } else {
          const payload = { amount: amt, source: source.trim() || "Income", received_by: who, note: note.trim(), received_on: date };
          if (editing) await api.updateIncome(entry.id, payload);
          else await api.addIncome(payload);
        }
      }
      onSaved(editing ? null : date);
    } catch (e) {
      alert(e.message || "Could not save.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Delete this entry?")) return;
    setBusy(true);
    try {
      if (kind === "expense") await api.deleteExpense(entry.id);
      else await api.deleteIncome(entry.id);
      onSaved(null);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  const isIncome = kind === "income";

  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
      <div
        ref={sheetRef}
        className={"sheet" + (open ? " open" : "")}
        style={dragging ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="grab" />

        {!editing && (
          <div className="seg">
            <button className={!isIncome ? "on" : ""} onClick={() => setKind("expense")}>− Expense</button>
            <button className={isIncome ? "on income" : ""} onClick={() => setKind("income")}>+ Income</button>
          </div>
        )}

        <h3>{editing ? (isIncome ? "Edit income" : "Edit expense") : isIncome ? "Add income" : "Add expense"}</h3>

        <input
          className="amount-in" inputMode="decimal" placeholder={CURRENCY + "0"}
          value={amount}
          style={err ? { borderColor: "var(--danger)" } : isIncome ? { color: "var(--brand)" } : undefined}
          onChange={(e) => { setAmount(e.target.value); setErr(false); }}
          autoFocus={!editing}
        />

        {isIncome ? (
          <>
            <label className="fl">Source</label>
            <div className="chips">
              {["Salary", "Bonus", "Side gig", "Gift", "Other"].map((s) => (
                <button type="button" key={s}
                  className={"chip" + (s === source ? " sel" : "")}
                  onClick={() => setSource(s)}>{s}</button>
              ))}
            </div>
            <label className="fl">Or type a custom source</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Salary" />

            <label className="fl">Who earned it</label>
            <div className="chips">
              {members.map((m) => (
                <button type="button" key={m.id}
                  className={"chip" + (m.id === who ? " sel" : "")}
                  onClick={() => setWho(m.id)}>👤 {m.display_name}</button>
              ))}
            </div>

            <label className="fl">Date received</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

            {!editing && (
              <label className="switch">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                <span>Repeat every month (e.g. salary on day {parseInt(date.slice(8, 10), 10) || 1})</span>
              </label>
            )}
          </>
        ) : (
          <>
            <label className="fl">Category</label>
            <div className="chips">
              {categories.map((c) => (
                <button type="button" key={c.id}
                  className={"chip" + (c.id === catId ? " sel" : "")}
                  onClick={() => setCatId(c.id)}>{c.icon} {c.name}</button>
              ))}
            </div>

            <label className="fl">Who paid</label>
            <div className="chips">
              {members.map((m) => (
                <button type="button" key={m.id}
                  className={"chip" + (m.id === who ? " sel" : "")}
                  onClick={() => setWho(m.id)}>👤 {m.display_name}</button>
              ))}
            </div>

            <label className="fl">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </>
        )}

        <label className="fl">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={isIncome ? "e.g. May payroll" : "e.g. weekly market run"} />

        <button className="btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : isIncome ? (repeat ? "Add recurring income" : "Add income") : "Add expense"}
        </button>
        {editing && <button className="btn danger" onClick={remove} disabled={busy}>Delete</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

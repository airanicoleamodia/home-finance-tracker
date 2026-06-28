import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastCtx = createContext(null);

// useToast() -> { success, error, info }. Safe to call even outside the provider
// (falls back to no-ops) so components never crash if mounted standalone.
export const useToast = () => useContext(ToastCtx) || NOOP;
const NOOP = { success() {}, error() {}, info() {} };

let seq = 0; // module-level id source (avoids Math.random + StrictMode churn)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const h = timers.current.get(id);
    if (h) { clearTimeout(h); timers.current.delete(id); }
  }, []);

  const push = useCallback((type, msg, ms) => {
    if (!msg) return;
    const id = ++seq;
    const life = ms ?? (type === "error" ? 5000 : 2800);
    setToasts((t) => [...t, { id, type, msg }]);
    if (life) timers.current.set(id, setTimeout(() => remove(id), life));
  }, [remove]);

  // Clear any pending timers if the provider unmounts (incl. StrictMode).
  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach(clearTimeout); map.clear(); };
  }, []);

  const api = useMemo(() => ({
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} className={"toast toast-" + t.type} onClick={() => remove(t.id)}>
            {t.msg}
          </button>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

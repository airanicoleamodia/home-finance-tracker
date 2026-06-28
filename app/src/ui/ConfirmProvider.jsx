import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "./useFocusTrap.js";

const ConfirmCtx = createContext(null);

// useConfirm() -> async ({title, body, danger, confirmText, cancelText, requireText}) => boolean.
// Falls back to window.confirm if used outside the provider.
export const useConfirm = () => useContext(ConfirmCtx) || fallback;
const fallback = (o = {}) => Promise.resolve(window.confirm(o.title || "Are you sure?"));

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { opts, resolve }
  const [typed, setTyped] = useState("");
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, !!state);

  const confirm = useCallback(
    (opts = {}) => new Promise((resolve) => { setTyped(""); setState({ opts, resolve }); }),
    []
  );

  const close = useCallback((val) => {
    setState((s) => { s?.resolve(val); return null; });
  }, []);

  // Escape cancels (desktop); the dialog never touches history, so the phone
  // Back button is intentionally left to the underlying hash router.
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  const o = state?.opts;
  const blocked = !!o?.requireText && typed !== o.requireText;

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="dialog-scrim" onClick={() => close(false)}>
          <div
            className="dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={o.title}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{o.title}</h3>
            {o.body && <p className="dialog-body">{o.body}</p>}
            {o.requireText && (
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={`Type ${o.requireText} to confirm`}
              />
            )}
            <button
              className={"btn" + (o.danger ? " danger" : "")}
              disabled={blocked}
              onClick={() => close(true)}
            >
              {o.confirmText || (o.danger ? "Delete" : "Confirm")}
            </button>
            <button className="btn ghost" onClick={() => close(false)}>
              {o.cancelText || "Cancel"}
            </button>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

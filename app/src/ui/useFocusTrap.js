import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Trap keyboard focus inside `ref` while `active`. On open, focus the first
// focusable element; Tab/Shift+Tab wrap at the edges; on close, restore focus
// to whatever was focused before. Dependency-free.
export function useFocusTrap(ref, active) {
  const prevFocus = useRef(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    // Remember what to restore to (guard against StrictMode double-invoke
    // overwriting it with an element already inside the trap).
    if (!prevFocus.current || !node.contains(prevFocus.current)) {
      prevFocus.current = document.activeElement;
    }

    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    const first = focusables()[0];
    if (first) first.focus();

    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const a = els[0];
      const b = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    node.addEventListener("keydown", onKey);

    return () => {
      node.removeEventListener("keydown", onKey);
      const restore = prevFocus.current;
      prevFocus.current = null;
      if (restore && typeof restore.focus === "function") restore.focus();
    };
  }, [ref, active]);
}

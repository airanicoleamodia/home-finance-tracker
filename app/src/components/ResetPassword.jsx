import { useState } from "react";
import { api } from "../lib/store.js";

// Shown when the user arrives from the password-reset email link
// (App.jsx detects the Supabase "PASSWORD_RECOVERY" event and renders this).
export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    try {
      await api.updatePassword(password);
      setInfo("Password updated. Taking you to the app…");
      setTimeout(() => onDone(), 900);
    } catch (e2) {
      setErr(e2.message || "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">₱</div>
      <h1>Set a new password</h1>
      <p className="s">Choose a new password for your account</p>

      <form onSubmit={submit}>
        <label className="fl">New password</label>
        <input type="password" autoComplete="new-password" value={password}
               onChange={(e) => setPassword(e.target.value)} minLength={6} required />

        <label className="fl">Confirm new password</label>
        <input type="password" autoComplete="new-password" value={confirm}
               onChange={(e) => setConfirm(e.target.value)} minLength={6} required />

        {err && <div className="err">{err}</div>}
        {info && <div className="hint" style={{ marginTop: 12 }}>{info}</div>}

        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
      </form>
    </div>
  );
}

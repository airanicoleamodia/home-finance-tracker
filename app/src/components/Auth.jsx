import { useState } from "react";
import { api } from "../lib/store.js";

export default function Auth({ onDone }) {
  // An invite link (?invite=<household_id>) lets a new member join an existing household.
  const invite = (() => { try { return new URLSearchParams(window.location.search).get("invite") || ""; } catch { return ""; } })();
  const [mode, setMode] = useState(invite ? "up" : "in"); // "in" | "up" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [household, setHousehold] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  function switchMode(next) {
    setErr(""); setInfo(""); setMode(next);
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "in") {
        await api.signIn(email.trim(), password);
        onDone();
      } else if (mode === "up") {
        await api.signUp(email.trim(), password, name.trim() || "Member", household.trim() || "My Household", invite);
        setInfo("Account created. If email confirmation is on, check your inbox, then sign in.");
        setMode("in");
      } else if (mode === "forgot") {
        await api.resetPassword(email.trim());
        setInfo("If an account exists for that email, a password reset link is on its way. Check your inbox (and spam).");
      }
    } catch (e2) {
      setErr(e2.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "in" ? "Sign in to your household"
    : mode === "up" ? "Create your household account"
    : "Reset your password";

  return (
    <div className="auth-wrap">
      <div className="auth-logo">₱</div>
      <h1>Home Finance Tracker</h1>
      <p className="s">{heading}</p>

      <form onSubmit={submit}>
        {mode === "up" && (
          <>
            {invite && <div className="hint" style={{ marginBottom: 10 }}>You're joining an existing household. 🎉</div>}
            <label className="fl">Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria" />
            {!invite && (
              <>
                <label className="fl">Household name</label>
                <input value={household} onChange={(e) => setHousehold(e.target.value)} placeholder="e.g. The Santos Home" />
              </>
            )}
          </>
        )}

        <label className="fl">Email</label>
        <input type="email" autoComplete="email" value={email}
               onChange={(e) => setEmail(e.target.value)} required />

        {mode !== "forgot" && (
          <>
            <label className="fl">Password</label>
            <input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"}
                   value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </>
        )}

        {mode === "in" && (
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button type="button" className="linkbtn" onClick={() => switchMode("forgot")}>
              Forgot password?
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div className="hint" style={{ marginTop: 10 }}>
            Enter your account email and we'll send a link to set a new password.
          </div>
        )}

        {err && <div className="err">{err}</div>}
        {info && <div className="hint" style={{ marginTop: 12 }}>{info}</div>}

        <button className="btn" disabled={busy}>
          {busy ? "Please wait…"
            : mode === "in" ? "Sign in"
            : mode === "up" ? "Create account"
            : "Send reset link"}
        </button>
      </form>

      <div className="auth-toggle">
        {mode === "forgot" ? (
          <>Remembered it? <button onClick={() => switchMode("in")}>Back to sign in</button></>
        ) : mode === "in" ? (
          <>New here? <button onClick={() => switchMode("up")}>Create a household</button></>
        ) : (
          <>Already have an account? <button onClick={() => switchMode("in")}>Sign in</button></>
        )}
      </div>
    </div>
  );
}

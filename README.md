# Home Finance Tracker

A mobile-first web app (PWA) to track household spending in **Philippine Peso (₱)** and finally see where the money goes — plus a **Claude (MCP) server** so you can add and query expenses by chat.

Built for **Strong Brands** per the project plan (`Home-Finance-Tracker-Plan.md`).

```
home-finance-tracker/
├── Home-Finance-Tracker-Plan.md   ← the plan
├── home-finance-tracker.html      ← no-setup standalone demo (open in any browser)
├── app/                           ← the real React PWA (frontend)
├── supabase/schema.sql            ← database tables + security
└── mcp-server/                    ← Claude integration (MCP)
```

You can use it three ways, in increasing capability:

1. **Try instantly** — open `home-finance-tracker.html` on your phone. No setup. Data stays on that device.
2. **Run the real app locally** — `app/` runs even *without* Supabase (local mode), then upgrades to shared cloud mode when you add credentials.
3. **Shared + Claude** — add Supabase + deploy + connect the MCP server.

---

## What's built (matches the plan)

- **Phase 1 — Core app:** fast expense entry, categories (standard + custom), shared multi-user (scales beyond 2), dashboard with donut + category bars, history with edit/delete, PWA install.
- **Income tracking:** log income (salary, bonus, side gigs, gifts), set **recurring** income (e.g. salary on day 15 that auto-counts every month), dashboard shows **income vs spending side by side + money left (net)** and a 6-month trend.
- **Phase 2 — Claude / MCP:** read + add/edit expenses *and income* by chat (`mcp-server/`).
- **Phase 3 — Budgets:** monthly limit per category with near/over warnings.
- Currency: **PHP only** for now (multi-currency is a later phase).

---

## 1. Run the app

```bash
cd app
npm install
npm run dev        # open the printed localhost URL on your phone/computer
```

With no `.env`, it runs in **Local mode** (device-only) so you can try everything immediately.

### Switch to shared cloud mode

1. Create a free project at https://supabase.com.
2. In Supabase → **SQL Editor**, paste and run `supabase/schema.sql`.
3. In `app/`, copy `.env.example` to `.env` and fill:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (Supabase → Project Settings → API)
4. Restart `npm run dev`. The header will now show **Shared**. Sign up to create your household; the standard categories are seeded automatically.

> Adding more household members later: each person signs up. To join an existing household instead of creating a new one, sign up with `household_id` in the user metadata (or invite them and update their `profiles.household_id` in Supabase). The schema supports this via the signup trigger.

---

## 2. Deploy (so the whole house can use it)

Easiest is **Vercel**:

1. Push this repo to GitHub (or import the `app/` folder).
2. In Vercel: New Project → set **Root Directory** to `app`.
3. Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Open the URL on each phone → browser menu → **Add to Home Screen**.

(Netlify works the same way: build command `npm run build`, publish dir `app/dist`.)

---

## 3. Connect Claude (MCP)

See `mcp-server/README.md`. In short: `npm install` in `mcp-server/`, fill the
service-role key + `HOUSEHOLD_ID`, add it to your Claude Desktop MCP config, and
ask Claude things like *"Add a ₱450 grocery expense"* or *"Are we over budget?"*.

---

## Env vars you'll add later (summary)

| Where | Variable | From |
|---|---|---|
| `app/.env` | `VITE_SUPABASE_URL` | Supabase → Settings → API |
| `app/.env` | `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API (anon) |
| `mcp-server/.env` | `SUPABASE_URL` | same URL |
| `mcp-server/.env` | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service_role, secret) |
| `mcp-server/.env` | `HOUSEHOLD_ID` | Supabase → Table editor → households |
| `mcp-server/.env` | `DEFAULT_PROFILE_ID` (optional) | Supabase → Table editor → profiles |

Everything runs without them first (local mode) — add them when you're ready to go shared.

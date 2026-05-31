# Deploying Home Finance Tracker

There are two things you can deploy:

1. **The app** — so everyone in the house opens it on their phone (required).
2. **The Claude MCP server** — so Claude can read/add expenses & income by chat (optional, do it after the app works).

A quick decision first:

- **Just want it live fast, data on each phone separately?** You can deploy the app *without* Supabase — it runs in "local mode." Skip to Step 2.
- **Want shared data across phones (recommended)?** Do Step 1 (Supabase) first, then Step 2.

---

## Step 1 — Supabase (shared cloud data)

1. Go to https://supabase.com → sign up (free) → **New project**. Pick a name and a strong database password. Wait ~2 min for it to provision.
2. Left sidebar → **SQL Editor** → **New query**. Open the file `supabase/schema.sql` from this project, copy everything, paste it in, click **Run**. You should see "Success."
3. Left sidebar → **Project Settings** (gear) → **API**. Copy these two values — you'll need them next:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon public** key (a long string)

That's it for the database.

---

## Step 2 — Deploy the app to Vercel (free)

This is the easiest host. You need a (free) GitHub account and a (free) Vercel account.

### 2a. Put the code on GitHub
- Create a new repository on https://github.com (e.g. `home-finance-tracker`).
- Upload this whole project folder to it (drag-and-drop in the GitHub web UI works, or use git).

### 2b. Import into Vercel
1. Go to https://vercel.com → sign in with GitHub → **Add New → Project** → pick your repo.
2. **Important — set the Root Directory to `app`** (click "Edit" next to Root Directory and choose the `app` folder). Vercel will auto-detect Vite.
   - Build command: `npm run build` (auto)
   - Output directory: `dist` (auto)
3. **Environment Variables** — add these two (only if you did Step 1):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
4. Click **Deploy**. After ~1 minute you get a live URL like `https://home-finance-tracker.vercel.app`.

### 2c. Use it on phones
- Open the URL on each phone's browser.
- Browser menu → **Add to Home Screen**. It now behaves like an installed app.
- If you set up Supabase, each person taps **Create a household** the first time (or joins yours — see "Adding people" below).

> **Netlify alternative:** New site from Git → Base directory `app`, Build command `npm run build`, Publish directory `app/dist`, add the same two env vars.

---

## Step 3 — Connect Claude (MCP server, optional)

Do this only after the app + Supabase work. Full details are in `mcp-server/README.md`. Short version:

1. In Supabase → **Project Settings → API**, also copy the **service_role** key (secret — never put this in the app or GitHub).
2. In Supabase → **Table editor → households**, copy your household's `id`.
3. The MCP server runs on *your computer* (not Vercel). In a terminal:
   ```
   cd mcp-server
   npm install
   ```
4. Add it to your Claude Desktop config with the env values filled in (see `mcp-server/README.md` for the exact JSON). Restart Claude.

Then you can say things like *"Add my ₱30,000 salary on the 15th every month"* or *"How much did we have left in May?"*

---

## Adding more household members (shared mode)

Each person installs the app from your Vercel URL and signs up. To have them join **your** household rather than create a new one, the simplest path for now: have them sign up, then in Supabase → **Table editor → profiles**, set their `household_id` to match yours. (A proper invite link can be added later.)

---

## Updating the app after changes

Because the app uses an offline service worker in production, after you push an update:
- Vercel redeploys automatically when you push to GitHub.
- On phones, the new version loads on next open (may take one extra refresh as the service worker updates).

---

## Cost

Everything here fits the **free tiers** (Supabase free project + Vercel hobby). A custom domain is optional (~$12/year) and can be added in Vercel → Project → Domains.

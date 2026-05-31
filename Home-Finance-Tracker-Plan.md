# Home Finance Tracker — Software Plan

**Prepared for:** Strong Brands
**Date:** May 31, 2026
**Goal:** Stop losing track of where the household money goes by building a simple, phone-friendly web app where the household can log expenses fast, categorize spending, and see clear breakdowns — and talk to it through Claude.

---

## 1. The Problem

At the end of each period you can't clearly answer "where did the money go?" The cause is usually that spending isn't recorded in one place at the moment it happens, and what is recorded isn't organized into categories you can compare.

The fix is a single shared place that is:

- **Fast to add to** — logging an expense should take under 10 seconds.
- **Always on hand** — works on the phone, from anywhere, no install needed.
- **Shared** — everyone in the house adds to the same account.
- **Clear** — automatic category breakdowns.

---

## 2. Confirmed Decisions

These are now locked in (no longer open questions):

| Topic | Decision |
|---|---|
| Currency | **Philippine Peso (₱ / PHP)** only for now |
| Users | **2 people to start**, but built to **scale** to more household members |
| Categories | **Standard default list + your custom additions** |
| Budgets | **Not in v1** — track spending first, add budget limits in a later phase |
| Multi-currency | **Not in v1** — PHP only for now, multi-currency considered later |
| Design | **Clean & simple** modern default, easy to read on a phone |
| Claude / MCP access | **Read + add/edit** — Claude can answer questions AND log/edit expenses by chat |

---

## 3. What We're Building (Scope)

A custom **web app** (a "Progressive Web App") that runs in any phone or desktop browser and can be "added to home screen" so it behaves like a normal app — no app store needed. This is the lightest way to be portable across Android, iPhone, and computer at once.

### Phase 1 features (the core build)

| Feature | What it does |
|---|---|
| Fast expense entry | Amount (in ₱), category, who paid, optional note — saved in a few taps |
| Categories | Standard defaults + your own additions; editable |
| Shared multi-user | Members log in and add to the same shared data; built to scale beyond 2 |
| Dashboard | "Where the money went" — this month by category, with charts |
| History & search | Browse and filter past expenses; edit or delete mistakes |

### Coming in later phases

Budgets & limits, multi-currency, recurring bills, reports/export, receipt photo scanning, and bank CSV import. Starting lean gets a working, reliable app in your hands faster.

---

## 4. How It Will Work (Plain English)

Each household member opens a web link, logs in, and lands on the dashboard. A big "+" button opens the add-expense screen: type the amount in pesos, pick a category, confirm. The expense instantly appears for everyone in the household. The dashboard always shows the current month's total and a category breakdown chart, so "where did the money go" is answered at a glance.

---

## 5. Recommended Technology

Chosen for low cost, speed to build, and being beginner-friendly to maintain.

| Layer | Recommendation | Why |
|---|---|---|
| App type | Progressive Web App (PWA) | One build runs on all phones + desktop, installable, no app store |
| Frontend | React | Common, well-supported, fast to build clean mobile UIs |
| Backend + database + login | **Supabase** | Database, user accounts, and shared real-time data out of the box; scales as you add users |
| Hosting | **Vercel** | Free tier is enough for a household; deploys in minutes |

**Cost estimate:** Effectively **$0–10/month** at household scale. Free tiers cover this; a custom domain (optional) is ~$12/year.

---

## 6. Data Model (What Gets Stored)

- **Households** — one record per home; people belong to a household (supports scaling to more members).
- **Users** — name, email, login; linked to a household.
- **Categories** — name, icon/color (standard + custom).
- **Expenses** — amount (PHP), date, category, who paid, note, household.

Every expense is tagged with a category and a household, so any breakdown is just a sum. (Budget limits and a currency field will be added to this model in later phases.)

---

## 7. Build Plan (Phases)

**Phase 0 — Setup (½–1 day)**
Create the project, Supabase database, and hosting. Define the data model above.

**Phase 1 — Core MVP (main build)**
1. Login / accounts (built to scale beyond 2 people).
2. Add-expense screen (fast entry, in ₱).
3. Expense list with edit/delete.
4. Categories management (defaults + your additions).
5. Dashboard: monthly total + category breakdown chart.
6. Mobile polish + "add to home screen" PWA setup.

**Phase 2 — Claude / MCP integration**
Build the MCP server (Section 8) so you can read, add, and edit expenses by chatting with Claude.

**Phase 3 — Budgets & quality of life**
Monthly limits per category with progress bars and over-limit warnings, monthly comparison, simple reports/export.

**Phase 4 — Future options**
Multi-currency, recurring expenses, receipt photo scanning, bank CSV import.

---

## 8. Connecting to Claude (MCP Server)

You want to talk to your finances in plain language — e.g. *"How much did we spend on groceries last month?"* or *"Add a ₱400 fuel expense"* — directly from Claude. This is done by building an **MCP server**.

### What MCP is (plain English)

MCP (Model Context Protocol) is an open standard that lets an LLM like Claude securely call your app's functions. You expose a small set of "tools," and Claude uses them on your behalf. It turns your finance app into something you can *ask questions to* and *give commands to* — not just tap buttons.

### How it fits the rest of the app

The MCP server reuses the **same database and logic** as the web app. The web app and Claude are just two front doors into the same data — nothing is duplicated.

```
        Web app (phone/desktop)  ─┐
                                  ├──►  Shared logic + Supabase database
        Claude via MCP server  ──┘
```

### Tools the MCP server would expose (Read + add/edit, per your choice)

| Tool | What Claude can do |
|---|---|
| list_expenses | Read expenses, filtered by date range / category / person |
| add_expense | Log a new expense from a chat message |
| edit_expense | Correct or update an existing expense |
| spending_summary | Get "where the money went" totals by category for a period |
| manage_categories | List or add categories |

### Technology, security & cost

- **Language:** TypeScript or Python using the official MCP SDK.
- **Auth:** a secure key/token so only your household can connect — important since Claude can edit financial data.
- **Hosting:** small service alongside the same Supabase setup; minimal added cost.
- **Effort:** small relative to the main app, because it wraps logic already built in Phase 1.

Built **after** Phase 1, once the database and core logic are stable, so there's no rework.

---

## 9. Open Items (Optional, Not Blocking)

Nothing is blocking the build. Two small things you can decide whenever convenient:

1. **Custom category additions** — send me the extra categories you want beyond the standard set (you can also just add them yourself in-app later).
2. **Domain name** — whether you want a custom web address (e.g. a Strong Brands subdomain) or are fine with the free hosting URL.

---

## 10. Suggested Next Step

I can start by building a **working prototype of the add-expense screen and dashboard** so you can try the core flow on your phone. Once that core is stable, we add the Claude/MCP layer (Phase 2), then budgets (Phase 3).

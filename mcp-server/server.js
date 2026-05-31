#!/usr/bin/env node
// =====================================================================
// Home Finance Tracker — MCP server
// Lets Claude read, add, and edit household expenses by chat.
// Transport: stdio (works with Claude Desktop / Claude Code MCP config).
//
// Tools:
//   list_expenses     - read expenses (date range / category / person)
//   add_expense       - log a new expense
//   edit_expense      - update an existing expense
//   delete_expense    - remove an expense
//   spending_summary  - totals by category for a month
//   check_budgets     - categories near/over their monthly limit
//   manage_categories - list or add categories
// =====================================================================
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HOUSEHOLD_ID, DEFAULT_PROFILE_ID } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !HOUSEHOLD_ID) {
  console.error("[home-finance-mcp] Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HOUSEHOLD_ID are required.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const HH = HOUSEHOLD_ID;
const PESO = "₱";
const money = (n) => PESO + Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });

// ---- helpers ---------------------------------------------------------
function monthBounds(month) {
  // month: "YYYY-MM" (defaults to current month)
  const now = new Date();
  const key = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = key.split("-").map(Number);
  const start = `${key}-01`;
  const end = new Date(y, m, 1).toISOString().slice(0, 10); // 1st of next month
  return { key, start, end };
}

async function categoryMap() {
  const { data } = await db.from("categories").select("id,name,icon,color").eq("household_id", HH);
  const byId = {}, byName = {};
  (data || []).forEach((c) => { byId[c.id] = c; byName[c.name.toLowerCase()] = c; });
  return { byId, byName, list: data || [] };
}
async function memberMap() {
  const { data } = await db.from("profiles").select("id,display_name").eq("household_id", HH);
  const byId = {}, byName = {};
  (data || []).forEach((p) => { byId[p.id] = p; byName[p.display_name.toLowerCase()] = p; });
  return { byId, byName, list: data || [] };
}

// Expand active recurring income rules into virtual entries for a month.
function expandRecurring(rules, monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return (rules || [])
    .filter((r) => r.active !== false && (!r.start_month || String(r.start_month).slice(0, 7) <= monthKey))
    .map((r) => {
      const day = Math.min(r.day_of_month || 1, lastDay);
      return {
        amount: Number(r.amount), source: r.source || "Salary",
        received_on: `${monthKey}-${String(day).padStart(2, "0")}`, recurring: true,
      };
    });
}
async function incomeForMonth(start, end, monthKey) {
  const { data } = await db.from("income").select("*").eq("household_id", HH)
    .gte("received_on", start).lt("received_on", end);
  const { data: rules } = await db.from("recurring_income").select("*").eq("household_id", HH);
  const real = (data || []).map((e) => ({ ...e, recurring: false }));
  return [...real, ...expandRecurring(rules || [], monthKey)];
}
const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (text) => ({ content: [{ type: "text", text }], isError: true });

// ---- tool definitions ------------------------------------------------
const TOOLS = [
  {
    name: "list_expenses",
    description: "List household expenses, optionally filtered by month (YYYY-MM), category name, or person name. Returns each expense with amount in PHP.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "Month as YYYY-MM. Defaults to current month." },
        category: { type: "string", description: "Filter by category name (e.g. 'Groceries')." },
        person: { type: "string", description: "Filter by who paid (display name)." },
        limit: { type: "number", description: "Max rows (default 50)." },
      },
    },
  },
  {
    name: "add_expense",
    description: "Add a new expense to the household. Amount is in PHP. Category and person are matched by name.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in PHP (required, > 0)." },
        category: { type: "string", description: "Category name. If unknown, 'Other' is used." },
        person: { type: "string", description: "Who paid (display name). Optional." },
        note: { type: "string", description: "Optional note." },
        date: { type: "string", description: "Date YYYY-MM-DD. Defaults to today." },
      },
      required: ["amount"],
    },
  },
  {
    name: "edit_expense",
    description: "Edit an existing expense by id. Only provided fields are changed.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Expense id (from list_expenses)." },
        amount: { type: "number" },
        category: { type: "string" },
        person: { type: "string" },
        note: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_expense",
    description: "Delete an expense by id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "spending_summary",
    description: "Summarize spending by category for a month (YYYY-MM). Shows total and per-category breakdown in PHP.",
    inputSchema: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM. Defaults to current month." } },
    },
  },
  {
    name: "list_income",
    description: "List income for a month (YYYY-MM), including recurring salary. Amounts in PHP.",
    inputSchema: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM. Defaults to current month." } },
    },
  },
  {
    name: "add_income",
    description: "Add a one-off income entry (e.g. bonus, gift, side gig). Amount in PHP.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in PHP (required, > 0)." },
        source: { type: "string", description: "e.g. 'Salary', 'Bonus'. Default 'Income'." },
        person: { type: "string", description: "Who earned it (display name). Optional." },
        note: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
      required: ["amount"],
    },
  },
  {
    name: "add_recurring_income",
    description: "Set up recurring monthly income (e.g. salary on day 15). Auto-counts every month.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in PHP (required, > 0)." },
        source: { type: "string", description: "Default 'Salary'." },
        day_of_month: { type: "number", description: "Day 1-31 it arrives (e.g. 15)." },
        person: { type: "string", description: "Who earns it. Optional." },
        note: { type: "string" },
      },
      required: ["amount", "day_of_month"],
    },
  },
  {
    name: "financial_summary",
    description: "Money in vs money out for a month (YYYY-MM): total income, total spending, and what's left (net), all in PHP.",
    inputSchema: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM. Defaults to current month." } },
    },
  },
  {
    name: "check_budgets",
    description: "Check this month's budgets and report which categories are near (>=80%) or over their limit.",
    inputSchema: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM. Defaults to current month." } },
    },
  },
  {
    name: "manage_categories",
    description: "List all categories, or add a new one. Action 'list' (default) or 'add' with a name.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "add"], description: "Default 'list'." },
        name: { type: "string", description: "Category name when action='add'." },
      },
    },
  },
];

// ---- server ----------------------------------------------------------
const server = new Server(
  { name: "home-finance-tracker", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case "list_expenses": return await listExpenses(args);
      case "add_expense": return await addExpense(args);
      case "edit_expense": return await editExpense(args);
      case "delete_expense": return await deleteExpense(args);
      case "spending_summary": return await spendingSummary(args);
      case "list_income": return await listIncome(args);
      case "add_income": return await addIncome2(args);
      case "add_recurring_income": return await addRecurringIncome2(args);
      case "financial_summary": return await financialSummary(args);
      case "check_budgets": return await checkBudgets(args);
      case "manage_categories": return await manageCategories(args);
      default: return fail(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return fail(`Error: ${e.message || e}`);
  }
});

// ---- tool implementations -------------------------------------------
async function listExpenses(a) {
  const { start, end, key } = monthBounds(a.month);
  const cats = await categoryMap();
  const mem = await memberMap();
  let q = db.from("expenses").select("*")
    .eq("household_id", HH).gte("spent_on", start).lt("spent_on", end)
    .order("spent_on", { ascending: false }).limit(a.limit || 50);
  if (a.category) {
    const c = cats.byName[a.category.toLowerCase()];
    if (!c) return ok(`No category named "${a.category}".`);
    q = q.eq("category_id", c.id);
  }
  if (a.person) {
    const p = mem.byName[a.person.toLowerCase()];
    if (!p) return ok(`No person named "${a.person}".`);
    q = q.eq("paid_by", p.id);
  }
  const { data, error } = await q;
  if (error) throw error;
  if (!data.length) return ok(`No expenses found for ${key}.`);
  const total = data.reduce((s, e) => s + Number(e.amount), 0);
  const lines = data.map((e) => {
    const c = cats.byId[e.category_id]; const p = mem.byId[e.paid_by];
    return `• ${e.spent_on} ${money(e.amount)} — ${c ? c.name : "Uncategorized"}${p ? " (" + p.display_name + ")" : ""}${e.note ? " — " + e.note : ""}  [id:${e.id}]`;
  });
  return ok(`Expenses for ${key} (${data.length}, total ${money(total)}):\n` + lines.join("\n"));
}

async function addExpense(a) {
  if (!(a.amount > 0)) return fail("amount must be greater than 0.");
  const cats = await categoryMap();
  const mem = await memberMap();
  const cat = (a.category && cats.byName[a.category.toLowerCase()]) || cats.byName["other"] || cats.list[0];
  const person = a.person ? mem.byName[a.person.toLowerCase()] : null;
  const row = {
    household_id: HH,
    amount: a.amount,
    category_id: cat ? cat.id : null,
    paid_by: person ? person.id : (DEFAULT_PROFILE_ID || null),
    note: a.note || "",
    spent_on: a.date || new Date().toISOString().slice(0, 10),
    created_by: DEFAULT_PROFILE_ID || null,
  };
  const { data, error } = await db.from("expenses").insert(row).select().single();
  if (error) throw error;
  return ok(`Added ${money(data.amount)} to ${cat ? cat.name : "Uncategorized"} on ${data.spent_on}. [id:${data.id}]`);
}

async function editExpense(a) {
  const cats = await categoryMap();
  const mem = await memberMap();
  const patch = {};
  if (a.amount != null) { if (!(a.amount > 0)) return fail("amount must be > 0."); patch.amount = a.amount; }
  if (a.category) { const c = cats.byName[a.category.toLowerCase()]; if (!c) return fail(`No category "${a.category}".`); patch.category_id = c.id; }
  if (a.person) { const p = mem.byName[a.person.toLowerCase()]; if (!p) return fail(`No person "${a.person}".`); patch.paid_by = p.id; }
  if (a.note != null) patch.note = a.note;
  if (a.date) patch.spent_on = a.date;
  if (!Object.keys(patch).length) return fail("Nothing to change.");
  const { data, error } = await db.from("expenses").update(patch).eq("id", a.id).eq("household_id", HH).select().single();
  if (error) throw error;
  if (!data) return fail("Expense not found.");
  return ok(`Updated expense ${a.id}: now ${money(data.amount)} on ${data.spent_on}.`);
}

async function deleteExpense(a) {
  const { error } = await db.from("expenses").delete().eq("id", a.id).eq("household_id", HH);
  if (error) throw error;
  return ok(`Deleted expense ${a.id}.`);
}

async function spendingSummary(a) {
  const { start, end, key } = monthBounds(a.month);
  const cats = await categoryMap();
  const { data, error } = await db.from("expenses").select("amount,category_id")
    .eq("household_id", HH).gte("spent_on", start).lt("spent_on", end);
  if (error) throw error;
  if (!data.length) return ok(`No spending recorded for ${key}.`);
  const by = {};
  data.forEach((e) => { by[e.category_id] = (by[e.category_id] || 0) + Number(e.amount); });
  const total = data.reduce((s, e) => s + Number(e.amount), 0);
  const rows = Object.entries(by).sort((x, y) => y[1] - x[1]).map(([id, v]) => {
    const c = cats.byId[id];
    return `• ${c ? c.name : "Uncategorized"}: ${money(v)} (${Math.round((v / total) * 100)}%)`;
  });
  return ok(`Spending for ${key} — total ${money(total)} across ${data.length} expenses:\n` + rows.join("\n"));
}

async function listIncome(a) {
  const { start, end, key } = monthBounds(a.month);
  const mem = await memberMap();
  const items = await incomeForMonth(start, end, key);
  if (!items.length) return ok(`No income recorded for ${key}.`);
  const total = items.reduce((s, e) => s + Number(e.amount), 0);
  const lines = items
    .sort((x, y) => y.received_on.localeCompare(x.received_on))
    .map((e) => `• ${e.received_on} ${money(e.amount)} — ${e.source}${e.received_by && mem.byId[e.received_by] ? " (" + mem.byId[e.received_by].display_name + ")" : ""}${e.recurring ? " [recurring]" : ""}`);
  return ok(`Income for ${key} (total ${money(total)}):\n` + lines.join("\n"));
}

async function addIncome2(a) {
  if (!(a.amount > 0)) return fail("amount must be > 0.");
  const mem = await memberMap();
  const person = a.person ? mem.byName[a.person.toLowerCase()] : null;
  const row = {
    household_id: HH, amount: a.amount, source: a.source || "Income",
    received_by: person ? person.id : (DEFAULT_PROFILE_ID || null),
    note: a.note || "", received_on: a.date || new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await db.from("income").insert(row).select().single();
  if (error) throw error;
  return ok(`Added income ${money(data.amount)} (${data.source}) on ${data.received_on}.`);
}

async function addRecurringIncome2(a) {
  if (!(a.amount > 0)) return fail("amount must be > 0.");
  if (!(a.day_of_month >= 1 && a.day_of_month <= 31)) return fail("day_of_month must be 1-31.");
  const mem = await memberMap();
  const person = a.person ? mem.byName[a.person.toLowerCase()] : null;
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  const row = {
    household_id: HH, amount: a.amount, source: a.source || "Salary",
    day_of_month: a.day_of_month, received_by: person ? person.id : (DEFAULT_PROFILE_ID || null),
    note: a.note || "", start_month: monthStart,
  };
  const { data, error } = await db.from("recurring_income").insert(row).select().single();
  if (error) throw error;
  return ok(`Set up recurring income: ${money(data.amount)} (${data.source}) on day ${data.day_of_month} every month.`);
}

async function financialSummary(a) {
  const { start, end, key } = monthBounds(a.month);
  const { data: exp } = await db.from("expenses").select("amount")
    .eq("household_id", HH).gte("spent_on", start).lt("spent_on", end);
  const inc = await incomeForMonth(start, end, key);
  const totalExp = (exp || []).reduce((s, e) => s + Number(e.amount), 0);
  const totalInc = inc.reduce((s, e) => s + Number(e.amount), 0);
  const net = totalInc - totalExp;
  const verdict = net >= 0 ? `${money(net)} left over` : `overspent by ${money(-net)}`;
  return ok(`Financial summary for ${key}:\n• Income: ${money(totalInc)}\n• Spending: ${money(totalExp)}\n• Net: ${verdict}`);
}

async function checkBudgets(a) {
  const { start, end, key } = monthBounds(a.month);
  const cats = await categoryMap();
  const { data: buds, error: be } = await db.from("budgets").select("category_id,amount")
    .eq("household_id", HH).eq("month", start);
  if (be) throw be;
  if (!buds.length) return ok(`No budgets set for ${key}.`);
  const { data: exp, error: ee } = await db.from("expenses").select("amount,category_id")
    .eq("household_id", HH).gte("spent_on", start).lt("spent_on", end);
  if (ee) throw ee;
  const spent = {};
  exp.forEach((e) => { spent[e.category_id] = (spent[e.category_id] || 0) + Number(e.amount); });
  const rows = buds.map((b) => {
    const c = cats.byId[b.category_id];
    const used = spent[b.category_id] || 0;
    const pct = b.amount ? Math.round((used / b.amount) * 100) : 0;
    const flag = pct >= 100 ? "🔴 OVER" : pct >= 80 ? "🟠 near" : "🟢 ok";
    return `${flag} ${c ? c.name : "?"}: ${money(used)} / ${money(b.amount)} (${pct}%)`;
  });
  return ok(`Budgets for ${key}:\n` + rows.join("\n"));
}

async function manageCategories(a) {
  if ((a.action || "list") === "add") {
    if (!a.name) return fail("Provide a category name to add.");
    const { data, error } = await db.from("categories")
      .insert({ household_id: HH, name: a.name, icon: "🏷️", color: "#6b7280", sort_order: 200 })
      .select().single();
    if (error) throw error;
    return ok(`Added category "${data.name}".`);
  }
  const cats = await categoryMap();
  return ok("Categories:\n" + cats.list.map((c) => `• ${c.icon} ${c.name}`).join("\n"));
}

// ---- start -----------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[home-finance-mcp] running (household " + HH + ")");

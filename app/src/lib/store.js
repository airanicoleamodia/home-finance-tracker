// =====================================================================
// Unified data layer.
//   - CLOUD MODE  : when Supabase env vars are set -> shared, multi-device
//   - LOCAL MODE  : otherwise -> data saved on this device (localStorage)
// Both expose the SAME async API so the UI never branches.
// =====================================================================
import { supabase, hasSupabase } from "./supabase.js";
import { ymKey, PALETTE } from "./format.js";

const DEFAULT_CATS = [
  { name: "Groceries", icon: "🛒", color: "#0f766e", sort_order: 10, is_default: true },
  { name: "Utilities", icon: "💡", color: "#2563eb", sort_order: 20, is_default: true },
  { name: "Rent / Mortgage", icon: "🏠", color: "#7c3aed", sort_order: 30, is_default: true },
  { name: "Transport", icon: "🚗", color: "#d97706", sort_order: 40, is_default: true },
  { name: "Eating Out", icon: "🍽️", color: "#dc2626", sort_order: 50, is_default: true },
  { name: "Health", icon: "💊", color: "#059669", sort_order: 60, is_default: true },
  { name: "Household", icon: "🧴", color: "#0891b2", sort_order: 70, is_default: true },
  { name: "Kids / School", icon: "🎒", color: "#db2777", sort_order: 80, is_default: true },
  { name: "Leisure", icon: "🎬", color: "#9333ea", sort_order: 90, is_default: true },
  { name: "Other", icon: "📦", color: "#6b7280", sort_order: 100, is_default: true },
];

export const MODE = hasSupabase ? "cloud" : "local";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// =====================================================================
//  LOCAL MODE implementation
// =====================================================================
const LKEY = "hft_local_v1";

function readStore() {
  try {
    const d = JSON.parse(localStorage.getItem(LKEY));
    if (d && d.expenses) return d;
  } catch (e) {}
  return {
    household: { id: "local", name: "My Household", currency: "PHP" },
    profile: { id: "me", display_name: "Me" },
    members: [
      { id: "me", display_name: "Me" },
      { id: "partner", display_name: "Partner" },
    ],
    categories: DEFAULT_CATS.map((c, i) => ({ id: "c" + i, ...c })),
    expenses: [],
    budgets: [], // { id, category_id, month:'YYYY-MM', amount }
    income: [], // { id, amount, source, received_by, note, received_on }
    recurring_income: [], // { id, amount, source, day_of_month, received_by, note, active, start_month:'YYYY-MM' }
  };
}
let L = readStore();
function lsave() { localStorage.setItem(LKEY, JSON.stringify(L)); }

// ----- shared helpers (used by both modes) -----
function clampDay(year, month0, day) {
  const last = new Date(year, month0 + 1, 0).getDate();
  return Math.min(day, last);
}
// Expand active recurring rules into virtual income entries for a month.
export function expandRecurring(rules, monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return (rules || [])
    .filter((r) => r.active !== false && (!r.start_month || r.start_month <= monthKey))
    .map((r) => {
      const day = clampDay(y, m - 1, r.day_of_month || 1);
      return {
        id: "rec:" + r.id + ":" + monthKey,
        rule_id: r.id,
        amount: Number(r.amount),
        source: r.source || "Salary",
        received_by: r.received_by || null,
        note: r.note || "",
        received_on: `${monthKey}-${String(day).padStart(2, "0")}`,
        recurring: true,
      };
    });
}
function addMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

const localApi = {
  async getSession() {
    return { user: L.profile, household: L.household };
  },
  async signIn() { return { ok: true }; },
  async signUp() { return { ok: true }; },
  async signOut() { return { ok: true }; },
  async resetPassword() { throw new Error("Password reset is only available in shared (cloud) mode."); },
  async updatePassword() { return { ok: true }; },

  async getCategories() {
    return [...L.categories].sort((a, b) => a.sort_order - b.sort_order);
  },
  async addCategory(name) {
    const c = {
      id: uid(), name, icon: "🏷️",
      color: PALETTE[L.categories.length % PALETTE.length],
      sort_order: 100 + L.categories.length, is_default: false,
    };
    L.categories.push(c); lsave(); return c;
  },
  async deleteCategory(id) {
    if (L.expenses.some((e) => e.category_id === id)) throw new Error("Category has expenses.");
    L.categories = L.categories.filter((c) => c.id !== id); lsave();
  },

  async getMembers() { return [...L.members]; },
  async addMember(name) {
    const m = { id: uid(), display_name: name };
    L.members.push(m); lsave(); return m;
  },
  async removeMember(id) {
    if (L.members.length <= 1) throw new Error("Keep at least one person.");
    L.members = L.members.filter((m) => m.id !== id); lsave();
  },

  async getExpenses(monthKey) {
    return L.expenses
      .filter((e) => e.spent_on.slice(0, 7) === monthKey)
      .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created - a.created);
  },
  async addExpense({ amount, category_id, paid_by, note, spent_on }) {
    const e = { id: uid(), amount: +amount, category_id, paid_by, note: note || "", spent_on, created: Date.now() };
    L.expenses.push(e); lsave(); return e;
  },
  async updateExpense(id, patch) {
    const e = L.expenses.find((x) => x.id === id);
    if (e) Object.assign(e, patch, { amount: +patch.amount }); lsave(); return e;
  },
  async deleteExpense(id) { L.expenses = L.expenses.filter((x) => x.id !== id); lsave(); },

  async getBudgets(monthKey) { return L.budgets.filter((b) => b.month === monthKey); },
  async setBudget(category_id, monthKey, amount) {
    let b = L.budgets.find((x) => x.category_id === category_id && x.month === monthKey);
    if (b) b.amount = +amount;
    else { b = { id: uid(), category_id, month: monthKey, amount: +amount }; L.budgets.push(b); }
    lsave(); return b;
  },
  async clearBudget(category_id, monthKey) {
    L.budgets = L.budgets.filter((b) => !(b.category_id === category_id && b.month === monthKey));
    lsave();
  },

  // ----- income -----
  async getIncome(monthKey) {
    const real = L.income
      .filter((e) => e.received_on.slice(0, 7) === monthKey)
      .map((e) => ({ ...e, recurring: false }));
    const virtual = expandRecurring(L.recurring_income, monthKey);
    return [...real, ...virtual].sort((a, b) => b.received_on.localeCompare(a.received_on));
  },
  async addIncome({ amount, source, received_by, note, received_on }) {
    const e = { id: uid(), amount: +amount, source: source || "Income", received_by, note: note || "", received_on, created: Date.now() };
    L.income.push(e); lsave(); return e;
  },
  async updateIncome(id, patch) {
    const e = L.income.find((x) => x.id === id);
    if (e) Object.assign(e, patch, { amount: +patch.amount }); lsave(); return e;
  },
  async deleteIncome(id) { L.income = L.income.filter((x) => x.id !== id); lsave(); },

  async getRecurringIncome() { return [...L.recurring_income]; },
  async addRecurringIncome({ amount, source, day_of_month, received_by, note, start_month }) {
    const r = { id: uid(), amount: +amount, source: source || "Salary", day_of_month: +day_of_month || 1,
      received_by: received_by || null, note: note || "", active: true,
      start_month: start_month || new Date().toISOString().slice(0, 7) };
    L.recurring_income.push(r); lsave(); return r;
  },
  async deleteRecurringIncome(id) { L.recurring_income = L.recurring_income.filter((r) => r.id !== id); lsave(); },

  // ----- trends: totals per month for the last n months ending at monthKey -----
  async getMonthlyTotals(monthKey, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const mk = addMonthKey(monthKey, -i);
      const exp = L.expenses.filter((e) => e.spent_on.slice(0, 7) === mk).reduce((s, e) => s + Number(e.amount), 0);
      const inc = (await this.getIncome(mk)).reduce((s, e) => s + Number(e.amount), 0);
      out.push({ month: mk, income: inc, expense: exp, net: inc - exp });
    }
    return out;
  },

  exportData() { return L; },
  async clearAll() { localStorage.removeItem(LKEY); L = readStore(); },
};

// =====================================================================
//  CLOUD MODE implementation (Supabase)
// =====================================================================
const monthStart = (monthKey) => monthKey + "-01";
function monthEnd(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m, 1); // first day of NEXT month
  return d.toISOString().slice(0, 10);
}

const cloudApi = {
  async getSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    const uidv = data.session.user.id;
    const { data: prof } = await supabase
      .from("profiles").select("id,display_name,household_id").eq("id", uidv).single();
    if (!prof) return { user: { id: uidv }, household: null, needsProfile: true };
    const { data: hh } = await supabase
      .from("households").select("id,name,currency").eq("id", prof.household_id).single();
    return { user: prof, household: hh };
  },
  onAuthChange(cb) {
    return supabase.auth.onAuthStateChange((event) => cb(event));
  },
  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error; return { ok: true };
  },
  async signUp(email, password, displayName, householdName) {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: displayName, household_name: householdName || "My Household" } },
    });
    if (error) throw error; return { ok: true };
  },
  async signOut() { await supabase.auth.signOut(); },
  // Send a password-reset email. The link returns the user to the app
  // with a recovery session; App.jsx then shows the "set new password" screen.
  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error; return { ok: true };
  },
  // Set a new password (used while in the recovery session from the email link).
  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error; return { ok: true };
  },

  async getCategories() {
    const { data, error } = await supabase
      .from("categories").select("*").order("sort_order");
    if (error) throw error; return data || [];
  },
  async addCategory(name) {
    const hid = await householdId();
    const { data, error } = await supabase.from("categories")
      .insert({ household_id: hid, name, icon: "🏷️", color: PALETTE[Math.floor(Math.random() * PALETTE.length)], sort_order: 200 })
      .select().single();
    if (error) throw error; return data;
  },
  async deleteCategory(id) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) throw error;
  },

  async getMembers() {
    const { data, error } = await supabase.from("profiles").select("id,display_name");
    if (error) throw error; return data || [];
  },
  async addMember() {
    throw new Error("In cloud mode, new people join by signing up with your household invite link.");
  },
  async removeMember() { throw new Error("Members manage their own accounts in cloud mode."); },

  async getExpenses(monthKey) {
    const { data, error } = await supabase
      .from("expenses").select("*")
      .gte("spent_on", monthStart(monthKey)).lt("spent_on", monthEnd(monthKey))
      .order("spent_on", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((e) => ({ ...e, created: new Date(e.created_at).getTime() }));
  },
  async addExpense({ amount, category_id, paid_by, note, spent_on }) {
    const hid = await householdId();
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase.from("expenses")
      .insert({ household_id: hid, amount, category_id, paid_by, note, spent_on, created_by: me })
      .select().single();
    if (error) throw error; return data;
  },
  async updateExpense(id, patch) {
    const { data, error } = await supabase.from("expenses")
      .update({ amount: patch.amount, category_id: patch.category_id, paid_by: patch.paid_by, note: patch.note, spent_on: patch.spent_on })
      .eq("id", id).select().single();
    if (error) throw error; return data;
  },
  async deleteExpense(id) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;
  },

  async getBudgets(monthKey) {
    const { data, error } = await supabase.from("budgets").select("*").eq("month", monthStart(monthKey));
    if (error) throw error;
    return (data || []).map((b) => ({ ...b, month: monthKey }));
  },
  async setBudget(category_id, monthKey, amount) {
    const hid = await householdId();
    const { data, error } = await supabase.from("budgets")
      .upsert({ household_id: hid, category_id, month: monthStart(monthKey), amount }, { onConflict: "household_id,category_id,month" })
      .select().single();
    if (error) throw error; return data;
  },
  async clearBudget(category_id, monthKey) {
    const { error } = await supabase.from("budgets").delete()
      .eq("category_id", category_id).eq("month", monthStart(monthKey));
    if (error) throw error;
  },

  // ----- income -----
  async getIncome(monthKey) {
    const { data, error } = await supabase.from("income").select("*")
      .gte("received_on", monthStart(monthKey)).lt("received_on", monthEnd(monthKey))
      .order("received_on", { ascending: false });
    if (error) throw error;
    const real = (data || []).map((e) => ({ ...e, recurring: false, created: new Date(e.created_at).getTime() }));
    const { data: rules } = await supabase.from("recurring_income").select("*");
    const ruleRows = (rules || []).map((r) => ({ ...r, start_month: (r.start_month || "").slice(0, 7) }));
    const virtual = expandRecurring(ruleRows, monthKey);
    return [...real, ...virtual].sort((a, b) => b.received_on.localeCompare(a.received_on));
  },
  async addIncome({ amount, source, received_by, note, received_on }) {
    const hid = await householdId();
    const { data, error } = await supabase.from("income")
      .insert({ household_id: hid, amount, source: source || "Income", received_by, note, received_on })
      .select().single();
    if (error) throw error; return data;
  },
  async updateIncome(id, patch) {
    const { data, error } = await supabase.from("income")
      .update({ amount: patch.amount, source: patch.source, received_by: patch.received_by, note: patch.note, received_on: patch.received_on })
      .eq("id", id).select().single();
    if (error) throw error; return data;
  },
  async deleteIncome(id) {
    const { error } = await supabase.from("income").delete().eq("id", id);
    if (error) throw error;
  },

  async getRecurringIncome() {
    const { data, error } = await supabase.from("recurring_income").select("*").order("day_of_month");
    if (error) throw error;
    return (data || []).map((r) => ({ ...r, start_month: (r.start_month || "").slice(0, 7) }));
  },
  async addRecurringIncome({ amount, source, day_of_month, received_by, note, start_month }) {
    const hid = await householdId();
    const { data, error } = await supabase.from("recurring_income")
      .insert({ household_id: hid, amount, source: source || "Salary", day_of_month: day_of_month || 1,
        received_by: received_by || null, note: note || "", start_month: (start_month || new Date().toISOString().slice(0, 7)) + "-01" })
      .select().single();
    if (error) throw error; return data;
  },
  async deleteRecurringIncome(id) {
    const { error } = await supabase.from("recurring_income").delete().eq("id", id);
    if (error) throw error;
  },

  async getMonthlyTotals(monthKey, n) {
    const first = addMonthKey(monthKey, -(n - 1));
    const rangeStart = monthStart(first);
    const rangeEnd = monthEnd(monthKey);
    const [{ data: exp }, { data: inc }] = await Promise.all([
      supabase.from("expenses").select("amount,spent_on").gte("spent_on", rangeStart).lt("spent_on", rangeEnd),
      supabase.from("income").select("amount,received_on").gte("received_on", rangeStart).lt("received_on", rangeEnd),
    ]);
    const rules = (await this.getRecurringIncome());
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const mk = addMonthKey(monthKey, -i);
      const e = (exp || []).filter((x) => x.spent_on.slice(0, 7) === mk).reduce((s, x) => s + Number(x.amount), 0);
      const realInc = (inc || []).filter((x) => x.received_on.slice(0, 7) === mk).reduce((s, x) => s + Number(x.amount), 0);
      const virtInc = expandRecurring(rules, mk).reduce((s, x) => s + Number(x.amount), 0);
      const ti = realInc + virtInc;
      out.push({ month: mk, income: ti, expense: e, net: ti - e });
    }
    return out;
  },

  exportData() { return null; },
  async clearAll() { throw new Error("Cloud data is shared — delete items individually."); },
};

let _hid = null;
async function householdId() {
  if (_hid) return _hid;
  const { data } = await supabase.from("profiles")
    .select("household_id").eq("id", (await supabase.auth.getUser()).data.user.id).single();
  _hid = data.household_id; return _hid;
}

export const api = MODE === "cloud" ? cloudApi : localApi;

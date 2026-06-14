import { beforeEach, describe, expect, it } from "vitest";
import { api, MODE, expandRecurring, expandRecurringExp } from "./store.js";

// These tests exercise the LOCAL-MODE data layer. Supabase env vars are absent
// in the test environment, so MODE === "local" and `api` is the localApi.

describe("environment", () => {
  it("runs in local mode (no Supabase env vars)", () => {
    expect(MODE).toBe("local");
  });
});

describe("expandRecurring (income)", () => {
  it("produces a virtual entry on/after start_month", () => {
    const rules = [
      { id: "r1", amount: 1000, source: "Salary", day_of_month: 15, start_month: "2026-03" },
    ];
    // Before start_month -> nothing.
    expect(expandRecurring(rules, "2026-02")).toHaveLength(0);
    // On start_month -> one entry.
    const onStart = expandRecurring(rules, "2026-03");
    expect(onStart).toHaveLength(1);
    expect(onStart[0].received_on).toBe("2026-03-15");
    expect(onStart[0].amount).toBe(1000);
    expect(onStart[0].recurring).toBe(true);
    // After start_month -> one entry.
    expect(expandRecurring(rules, "2026-06")).toHaveLength(1);
  });

  it("respects active:false", () => {
    const rules = [
      { id: "r1", amount: 500, day_of_month: 5, start_month: "2026-01", active: false },
    ];
    expect(expandRecurring(rules, "2026-05")).toHaveLength(0);
  });

  it("clamps day-of-month to the month's last day (day 31 in February)", () => {
    const rules = [
      { id: "r1", amount: 1, day_of_month: 31, start_month: "2026-01" },
    ];
    // Feb 2026 has 28 days.
    expect(expandRecurring(rules, "2026-02")[0].received_on).toBe("2026-02-28");
    // Jan 2026 keeps 31.
    expect(expandRecurring(rules, "2026-01")[0].received_on).toBe("2026-01-31");
  });
});

describe("expandRecurringExp (expenses)", () => {
  it("produces a virtual entry on/after start_month", () => {
    const rules = [
      { id: "e1", amount: 250, category_id: "c0", day_of_month: 1, start_month: "2026-04" },
    ];
    expect(expandRecurringExp(rules, "2026-03")).toHaveLength(0);
    const got = expandRecurringExp(rules, "2026-04");
    expect(got).toHaveLength(1);
    expect(got[0].spent_on).toBe("2026-04-01");
    expect(got[0].amount).toBe(250);
    expect(got[0].recurring).toBe(true);
  });

  it("respects active:false", () => {
    const rules = [
      { id: "e1", amount: 250, day_of_month: 10, start_month: "2026-01", active: false },
    ];
    expect(expandRecurringExp(rules, "2026-06")).toHaveLength(0);
  });

  it("clamps day-of-month to the month's last day (day 31 in February)", () => {
    const rules = [
      { id: "e1", amount: 1, day_of_month: 31, start_month: "2026-01" },
    ];
    expect(expandRecurringExp(rules, "2026-02")[0].spent_on).toBe("2026-02-28");
  });
});

// Helper: read a single account's balance through the public API.
async function balanceOf(id) {
  const accounts = await api.getAccounts();
  return accounts.find((a) => a.id === id)?.balance;
}

describe("account balance integrity (local mode)", () => {
  beforeEach(async () => {
    await api.clearAll(); // re-seeds the fresh default store (accounts a0/a1/a2 at 0)
  });

  it("seeds the three default accounts at balance 0", async () => {
    const accounts = await api.getAccounts();
    expect(accounts.map((a) => a.id)).toEqual(["a0", "a1", "a2"]);
    expect(accounts.every((a) => a.balance === 0)).toBe(true);
  });

  it("addIncome increases the account balance by the amount", async () => {
    await api.addIncome({ amount: 1500, account_id: "a1", received_on: "2026-06-01" });
    expect(await balanceOf("a1")).toBe(1500);
  });

  it("addExpense decreases the account balance by the amount", async () => {
    await api.addExpense({ amount: 400, category_id: "c0", account_id: "a1", spent_on: "2026-06-02" });
    expect(await balanceOf("a1")).toBe(-400);
  });

  it("updateIncome adjusts the balance (reverse old, apply new)", async () => {
    const inc = await api.addIncome({ amount: 1000, account_id: "a0", received_on: "2026-06-01" });
    expect(await balanceOf("a0")).toBe(1000);
    await api.updateIncome(inc.id, { amount: 1700 });
    expect(await balanceOf("a0")).toBe(1700);
  });

  it("updateExpense adjusts the balance (reverse old, apply new)", async () => {
    const exp = await api.addExpense({ amount: 300, category_id: "c0", account_id: "a0", spent_on: "2026-06-03" });
    expect(await balanceOf("a0")).toBe(-300);
    await api.updateExpense(exp.id, { amount: 500 });
    expect(await balanceOf("a0")).toBe(-500);
  });

  it("updateIncome can move the effect to a different account", async () => {
    const inc = await api.addIncome({ amount: 800, account_id: "a0", received_on: "2026-06-01" });
    expect(await balanceOf("a0")).toBe(800);
    await api.updateIncome(inc.id, { amount: 800, account_id: "a2" });
    expect(await balanceOf("a0")).toBe(0);
    expect(await balanceOf("a2")).toBe(800);
  });

  it("deleteIncome reverses the balance effect", async () => {
    const inc = await api.addIncome({ amount: 1200, account_id: "a1", received_on: "2026-06-01" });
    expect(await balanceOf("a1")).toBe(1200);
    await api.deleteIncome(inc.id);
    expect(await balanceOf("a1")).toBe(0);
  });

  it("deleteExpense reverses the balance effect", async () => {
    const exp = await api.addExpense({ amount: 250, category_id: "c0", account_id: "a1", spent_on: "2026-06-04" });
    expect(await balanceOf("a1")).toBe(-250);
    await api.deleteExpense(exp.id);
    expect(await balanceOf("a1")).toBe(0);
  });

  it("works with a user-created account via addAccount", async () => {
    const acct = await api.addAccount({ name: "Savings", icon: "🏦", balance: 100 });
    expect(await balanceOf(acct.id)).toBe(100);
    await api.addIncome({ amount: 50, account_id: acct.id, received_on: "2026-06-01" });
    expect(await balanceOf(acct.id)).toBe(150);
    await api.addExpense({ amount: 30, category_id: "c0", account_id: acct.id, spent_on: "2026-06-05" });
    expect(await balanceOf(acct.id)).toBe(120);
  });
});

describe("transfers (local mode)", () => {
  beforeEach(async () => {
    await api.clearAll();
  });

  it("addTransfer decrements from_account and increments to_account", async () => {
    const t = await api.addTransfer({ amount: 600, from_account: "a1", to_account: "a0", moved_on: "2026-06-10" });
    expect(await balanceOf("a1")).toBe(-600);
    expect(await balanceOf("a0")).toBe(600);
    expect(t.amount).toBe(600);
  });

  it("deleteTransfer reverses both accounts", async () => {
    const t = await api.addTransfer({ amount: 600, from_account: "a1", to_account: "a0", moved_on: "2026-06-10" });
    await api.deleteTransfer(t.id);
    expect(await balanceOf("a1")).toBe(0);
    expect(await balanceOf("a0")).toBe(0);
  });

  it("a transfer fee is charged to the source account as a linked expense", async () => {
    const cat = (await api.getCategories())[0];
    await api.addTransfer({ amount: 600, fee: 25, from_account: "a1", to_account: "a0", moved_on: "2026-06-10", fee_category_id: cat.id });
    // source loses amount + fee, destination gains amount
    expect(await balanceOf("a1")).toBe(-625);
    expect(await balanceOf("a0")).toBe(600);
    // the fee shows up as a real expense linked to the transfer
    const fees = (await api.getExpenses("2026-06")).filter((e) => e.transfer_id);
    expect(fees).toHaveLength(1);
    expect(fees[0].amount).toBe(25);
    expect(fees[0].account_id).toBe("a1");
  });

  it("deleting a transfer with a fee reverses the fee and removes the linked expense", async () => {
    const cat = (await api.getCategories())[0];
    const t = await api.addTransfer({ amount: 600, fee: 25, from_account: "a1", to_account: "a0", moved_on: "2026-06-10", fee_category_id: cat.id });
    await api.deleteTransfer(t.id);
    expect(await balanceOf("a1")).toBe(0);
    expect(await balanceOf("a0")).toBe(0);
    const fees = (await api.getExpenses("2026-06")).filter((e) => e.transfer_id);
    expect(fees).toHaveLength(0);
  });
});

describe("loans (local mode)", () => {
  beforeEach(async () => { await api.clearAll(); });

  it("lending out decreases the source account; borrowing increases it", async () => {
    await api.addLoan({ is_lent: true, counterparty: "Tito Boy", principal: 5000, account_id: "a0", started_on: "2026-06-01" });
    expect(await balanceOf("a0")).toBe(-5000);
    await api.addLoan({ is_lent: false, counterparty: "Home Credit", principal: 10000, account_id: "a1", started_on: "2026-06-01" });
    expect(await balanceOf("a1")).toBe(10000);
  });

  it("outstanding = principal − sum(repayments) across partial repayments", async () => {
    const l = await api.addLoan({ is_lent: true, counterparty: "Ana", principal: 1000, account_id: "a0", started_on: "2026-06-01" });
    await api.addRepayment({ loan_id: l.id, amount: 300, account_id: "a0", paid_on: "2026-06-10" });
    await api.addRepayment({ loan_id: l.id, amount: 200, account_id: "a0", paid_on: "2026-06-20" });
    const loan = (await api.getLoans()).find((x) => x.id === l.id);
    expect(loan.repaid).toBe(500);
    expect(loan.outstanding).toBe(500);
  });

  it("repaying a loan we gave brings cash in; a loan we owe sends cash out", async () => {
    const lent = await api.addLoan({ is_lent: true, counterparty: "Ana", principal: 1000, account_id: "a0", started_on: "2026-06-01" });
    expect(await balanceOf("a0")).toBe(-1000);
    await api.addRepayment({ loan_id: lent.id, amount: 400, account_id: "a0", paid_on: "2026-06-10" });
    expect(await balanceOf("a0")).toBe(-600);

    const owed = await api.addLoan({ is_lent: false, counterparty: "Bank", principal: 2000, account_id: "a1", started_on: "2026-06-01" });
    expect(await balanceOf("a1")).toBe(2000);
    await api.addRepayment({ loan_id: owed.id, amount: 500, account_id: "a1", paid_on: "2026-06-10" });
    expect(await balanceOf("a1")).toBe(1500);
  });

  it("deleting a repayment, then the loan, fully reverses cash", async () => {
    const l = await api.addLoan({ is_lent: true, counterparty: "Ana", principal: 1000, account_id: "a0", started_on: "2026-06-01" });
    const r = await api.addRepayment({ loan_id: l.id, amount: 400, account_id: "a0", paid_on: "2026-06-10" });
    await api.deleteRepayment(r.id);
    expect(await balanceOf("a0")).toBe(-1000); // back to just the loan-out effect
    await api.deleteLoan(l.id);
    expect(await balanceOf("a0")).toBe(0);
    expect(await api.getLoans()).toHaveLength(0);
  });

  it("a loan with no account still tracks outstanding without moving cash", async () => {
    const l = await api.addLoan({ is_lent: true, counterparty: "Cash deal", principal: 800, account_id: null, started_on: "2026-06-01" });
    expect(await balanceOf("a0")).toBe(0);
    expect(await balanceOf("a1")).toBe(0);
    const loan = (await api.getLoans()).find((x) => x.id === l.id);
    expect(loan.outstanding).toBe(800);
  });
});

describe("danger zone (local mode)", () => {
  beforeEach(async () => { await api.clearAll(); });

  it("resetData clears transactions, zeroes balances, and keeps accounts", async () => {
    await api.addIncome({ amount: 1000, received_on: "2026-06-01", account_id: "a1" });
    await api.addExpense({ amount: 100, spent_on: "2026-06-02", account_id: "a0" });
    await api.resetData();
    expect(await api.getExpenses("2026-06")).toHaveLength(0);
    expect(await api.getIncome("2026-06")).toHaveLength(0);
    const accounts = await api.getAccounts();
    expect(accounts.length).toBeGreaterThan(0);     // accounts kept
    expect(accounts.every((a) => a.balance === 0)).toBe(true); // balances zeroed
  });

  it("factoryReset wipes data and restores default accounts", async () => {
    await api.addAccount({ name: "Crypto", icon: "🪙", balance: 500 });
    await api.factoryReset();
    const accounts = await api.getAccounts();
    expect(accounts.some((a) => a.name === "Crypto")).toBe(false); // custom account gone
    expect(accounts.length).toBe(3);                                // defaults restored
  });
});

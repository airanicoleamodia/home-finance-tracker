-- =====================================================================
-- Home Finance Tracker — Supabase schema
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE where possible).
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ---------- Tables ----------

-- A household = one home. People belong to a household. Scales to N members.
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'My Household',
  currency    text not null default 'PHP',   -- Philippine Peso for now
  created_at  timestamptz not null default now()
);

-- One profile per logged-in user, linked to their household.
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  household_id  uuid not null references households(id) on delete cascade,
  display_name  text not null default 'Member',
  role          text not null default 'member',  -- 'admin' (household creator) or 'member'
  created_at    timestamptz not null default now()
);
create index if not exists profiles_household_idx on profiles(household_id);

-- Spending categories (standard defaults + custom additions).
create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  icon          text not null default '🏷️',
  color         text not null default '#6b7280',
  sort_order    int  not null default 100,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists categories_household_idx on categories(household_id);

-- Money locations with a manually-maintained balance (banks, e-wallets, cash…).
create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null default 'Account',
  icon          text not null default '🏦',
  balance       numeric(12,2) not null default 0,
  sort_order    int  not null default 100,
  created_at    timestamptz not null default now()
);
create index if not exists accounts_household_idx on accounts(household_id);

-- Expenses. amount is stored in the household currency (PHP).
create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  category_id   uuid references categories(id) on delete set null,
  paid_by       uuid references profiles(id) on delete set null, -- who paid
  account_id    uuid references accounts(id) on delete set null, -- paid from which account
  transfer_id   uuid,                                            -- set when this expense is a transfer fee
  items         jsonb not null default '[]'::jsonb,              -- optional breakdown of what's included
  note          text default '',
  spent_on      date not null default current_date,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists expenses_household_idx on expenses(household_id);
create index if not exists expenses_spent_on_idx on expenses(spent_on);

-- Income entries (salary, bonus, gifts, side gigs). amount in PHP.
create table if not exists income (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  source        text not null default 'Income',   -- e.g. 'Salary', 'Bonus'
  received_by   uuid references profiles(id) on delete set null, -- who earned it
  account_id    uuid references accounts(id) on delete set null, -- deposited into which account
  note          text default '',
  received_on   date not null default current_date,
  created_at    timestamptz not null default now()
);
create index if not exists income_household_idx on income(household_id);
create index if not exists income_received_on_idx on income(received_on);

-- Recurring income rules (e.g. salary on day 15 each month).
create table if not exists recurring_income (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  source        text not null default 'Salary',
  day_of_month  int  not null default 1 check (day_of_month between 1 and 31),
  received_by   uuid references profiles(id) on delete set null,
  note          text default '',
  active        boolean not null default true,
  start_month   date not null default date_trunc('month', current_date)::date,
  created_at    timestamptz not null default now()
);
create index if not exists recincome_household_idx on recurring_income(household_id);

-- Recurring expense rules (e.g. rent on day 1, subscriptions).
create table if not exists recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  category_id   uuid references categories(id) on delete set null,
  paid_by       uuid references profiles(id) on delete set null,
  day_of_month  int  not null default 1 check (day_of_month between 1 and 31),
  note          text default '',
  active        boolean not null default true,
  start_month   date not null default date_trunc('month', current_date)::date,
  created_at    timestamptz not null default now()
);
create index if not exists recexp_household_idx on recurring_expenses(household_id);

-- Transfers move money between two accounts (no income/expense effect).
create table if not exists transfers (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  fee           numeric(12,2) not null default 0 check (fee >= 0), -- optional transfer fee (recorded as an expense)
  from_account  uuid references accounts(id) on delete set null,
  to_account    uuid references accounts(id) on delete set null,
  note          text default '',
  moved_on      date not null default current_date,
  created_at    timestamptz not null default now()
);
create index if not exists transfers_household_idx on transfers(household_id);
create index if not exists transfers_moved_on_idx on transfers(moved_on);

-- Loans: money we lent out (is_lent=true, a receivable) or borrowed (is_lent=false, a payable).
create table if not exists loans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  is_lent       boolean not null,                 -- true = we lent out, false = we borrowed
  counterparty  text not null default '',         -- free-text name (e.g. 'Tito Boy', 'Home Credit')
  principal     numeric(12,2) not null check (principal > 0),
  account_id    uuid references accounts(id) on delete set null,  -- cash account moved on creation (optional)
  note          text default '',
  started_on    date not null default current_date,
  due_on        date,                             -- optional due date
  created_at    timestamptz not null default now()
);
create index if not exists loans_household_idx on loans(household_id);

-- Repayments against a loan (partial payments over time).
create table if not exists loan_repayments (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  loan_id       uuid not null references loans(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  account_id    uuid references accounts(id) on delete set null,  -- cash account moved (optional)
  note          text default '',
  paid_on       date not null default current_date,
  created_at    timestamptz not null default now()
);
create index if not exists loanrepay_household_idx on loan_repayments(household_id);
create index if not exists loanrepay_loan_idx on loan_repayments(loan_id);

-- Monthly budgets per category (Phase 3). month stored as first day of month.
create table if not exists budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  category_id   uuid not null references categories(id) on delete cascade,
  month         date not null,                  -- e.g. 2026-05-01
  amount        numeric(12,2) not null check (amount >= 0),
  created_at    timestamptz not null default now(),
  unique (household_id, category_id, month)
);
create index if not exists budgets_household_idx on budgets(household_id);

-- ---------- Helper: current user's household ----------
create or replace function current_household_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select household_id from profiles where id = auth.uid();
$$;

-- ---------- Row Level Security ----------
-- Every member can only read/write rows belonging to THEIR household.
alter table households enable row level security;
alter table profiles   enable row level security;
alter table categories enable row level security;
alter table expenses   enable row level security;
alter table budgets    enable row level security;
alter table income            enable row level security;
alter table recurring_income  enable row level security;
alter table recurring_expenses enable row level security;
alter table accounts          enable row level security;
alter table transfers         enable row level security;
alter table loans             enable row level security;
alter table loan_repayments   enable row level security;

-- households: members can see + update their own household
drop policy if exists hh_select on households;
create policy hh_select on households for select
  using (id = current_household_id());
drop policy if exists hh_update on households;
create policy hh_update on households for update
  using (id = current_household_id());

-- profiles: a user can see members of their household; manage their own row
drop policy if exists pr_select on profiles;
create policy pr_select on profiles for select
  using (household_id = current_household_id());
drop policy if exists pr_insert on profiles;
create policy pr_insert on profiles for insert
  with check (id = auth.uid());
drop policy if exists pr_update on profiles;
create policy pr_update on profiles for update
  using (id = auth.uid());

-- categories / expenses / budgets: full access within own household
drop policy if exists cat_all on categories;
create policy cat_all on categories for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists exp_all on expenses;
create policy exp_all on expenses for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists bud_all on budgets;
create policy bud_all on budgets for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists inc_all on income;
create policy inc_all on income for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists recinc_all on recurring_income;
create policy recinc_all on recurring_income for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists acc_all on accounts;
create policy acc_all on accounts for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists recexp_all on recurring_expenses;
create policy recexp_all on recurring_expenses for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists trf_all on transfers;
create policy trf_all on transfers for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists loans_all on loans;
create policy loans_all on loans for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists loanrepay_all on loan_repayments;
create policy loanrepay_all on loan_repayments for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- ---------- Migration for existing databases ----------
-- (adds columns/tables that older installs won't have; safe to re-run)
alter table expenses add column if not exists account_id uuid references accounts(id) on delete set null;
alter table income   add column if not exists account_id uuid references accounts(id) on delete set null;
alter table expenses  add column if not exists transfer_id uuid;
alter table expenses  add column if not exists items jsonb not null default '[]'::jsonb;
alter table transfers add column if not exists fee numeric(12,2) not null default 0;
alter table profiles  add column if not exists role text not null default 'member';
-- Backfill: the earliest profile in each household (its creator) becomes admin.
update profiles p set role = 'admin'
where p.created_at = (select min(p2.created_at) from profiles p2 where p2.household_id = p.household_id)
  and p.role <> 'admin';

-- ---------- New-user bootstrap ----------
-- When a user signs up: create a household (or join one via invite metadata)
-- and a profile, then seed the 10 standard categories.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  hh uuid;
  invite uuid;
begin
  -- If the signup included an existing household id in metadata, join it.
  invite := nullif(new.raw_user_meta_data->>'household_id','')::uuid;

  if invite is not null then
    hh := invite;
  else
    insert into households (name, currency)
    values (coalesce(new.raw_user_meta_data->>'household_name','My Household'), 'PHP')
    returning id into hh;
  end if;

  -- The household creator becomes admin; people who join via invite are members.
  insert into profiles (id, household_id, display_name, role)
  values (new.id, hh,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
          case when invite is null then 'admin' else 'member' end);

  -- Seed standard categories only for a brand-new household.
  if invite is null then
    insert into categories (household_id, name, icon, color, sort_order, is_default) values
      (hh,'Groceries','🛒','#0f766e',10,true),
      (hh,'Utilities','💡','#2563eb',20,true),
      (hh,'Rent / Mortgage','🏠','#7c3aed',30,true),
      (hh,'Transport','🚗','#d97706',40,true),
      (hh,'Eating Out','🍽️','#dc2626',50,true),
      (hh,'Health','💊','#059669',60,true),
      (hh,'Household','🧴','#0891b2',70,true),
      (hh,'Kids / School','🎒','#db2777',80,true),
      (hh,'Leisure','🎬','#9333ea',90,true),
      (hh,'Other','📦','#6b7280',100,true);

    -- Seed common money locations (balances start at 0, fully editable).
    insert into accounts (household_id, name, icon, balance, sort_order) values
      (hh,'Cash on hand','💵',0,10),
      (hh,'Bank','🏦',0,20),
      (hh,'E-wallet','📱',0,30);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Convenience view: spending by category per month ----------
create or replace view v_spending_by_category as
select
  e.household_id,
  date_trunc('month', e.spent_on)::date as month,
  e.category_id,
  c.name  as category_name,
  c.icon  as category_icon,
  c.color as category_color,
  sum(e.amount) as total,
  count(*) as count
from expenses e
left join categories c on c.id = e.category_id
group by 1,2,3,4,5,6;

-- Done.

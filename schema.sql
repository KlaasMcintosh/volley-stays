-- Volley Stays database setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then press "Run".

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  url text,
  name text not null,
  total_price numeric,
  people int,
  bedrooms int,
  beds int,
  distance text,
  cancel_by date,
  notes text,
  status text not null default 'idea' check (status in ('idea', 'shortlisted', 'booked', 'paid')),
  booked_by text,
  added_by text,
  created_at timestamptz not null default now()
);

create table if not exists members (
  name text primary key,
  created_at timestamptz not null default now()
);

-- One row per person per event: their ordered list of option ids (first = top pick).
create table if not exists rankings (
  event_id uuid not null references events(id) on delete cascade,
  member text not null,
  option_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (event_id, member)
);

-- No accounts: anyone with the app link can read and edit.
alter table events enable row level security;
alter table options enable row level security;
alter table members enable row level security;
alter table rankings enable row level security;

create policy "open access" on events for all to anon, authenticated using (true) with check (true);
create policy "open access" on options for all to anon, authenticated using (true) with check (true);
create policy "open access" on members for all to anon, authenticated using (true) with check (true);
create policy "open access" on rankings for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on events, options, members, rankings to anon, authenticated;

-- Live updates between everyone's phones.
alter publication supabase_realtime add table events, options, members, rankings;

-- Starting events (edit or delete them in the app).
insert into events (name, start_date, end_date, location) values
  ('Aussie Open', '2027-01-07', '2027-01-10', ''),
  ('Canberra',    '2027-01-21', '2027-01-24', ''),
  ('Glenelg',     '2027-02-11', '2027-02-14', 'Glenelg Beach, SA'),
  ('Coolangatta', '2027-03-11', '2027-03-14', 'Coolangatta Beach, QLD'),
  ('Cobram',      '2027-04-08', '2027-04-11', 'Thompsons Beach, Cobram, VIC');

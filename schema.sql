-- Car Sales Command Center - PostgreSQL / Supabase schema
-- Intended for the hosted version after the local prototype is validated.

create extension if not exists "uuid-ossp";

create table app_users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  display_name text,
  created_at timestamptz default now()
);

create table app_settings (
  user_id uuid primary key references app_users(id) on delete cascade,
  commission_rate numeric(5,4) default 0.10,
  half_deal_multiplier numeric(5,4) default 0.50,
  renewal_days integer default 7,
  dealership_address text,
  ghl_booking_link text,
  credit_application_link text,
  updated_at timestamptz default now()
);

create table vehicles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id) on delete cascade,
  stock_number text,
  vin text,
  year integer,
  make text,
  model_trim text,
  color text,
  mileage integer,
  dealer_price numeric(12,2),
  photo_count integer default 0,
  inventory_status text default 'Available',
  acquired_date date,
  idms_last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, stock_number),
  unique(user_id, vin)
);

create table listings (
  id uuid primary key default uuid_generate_v4(),
  vehicle_id uuid references vehicles(id) on delete cascade,
  platform text not null check(platform in ('Facebook Marketplace','Craigslist')),
  external_listing_id text,
  external_url text,
  listing_price numeric(12,2),
  status text default 'Not Posted',
  posted_at timestamptz,
  last_renewed_at timestamptz,
  last_checked_at timestamptz,
  lead_count integer default 0,
  appointment_count integer default 0,
  application_count integer default 0,
  created_at timestamptz default now(),
  unique(vehicle_id, platform)
);

create table leads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  name text not null,
  phone text,
  email text,
  source text,
  ghl_contact_id text,
  ghl_opportunity_id text,
  stage text default 'New Lead',
  cash_or_finance text,
  has_trade boolean,
  application_status text default 'Not Sent',
  appointment_at timestamptz,
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  priority text default 'Medium',
  task_type text,
  title text not null,
  due_at timestamptz,
  status text default 'Open',
  created_at timestamptz default now()
);

create table deals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  deal_date date not null,
  customer_name text,
  lead_source text,
  deal_type text check(deal_type in ('Full','Half')),
  gross_profit numeric(12,2),
  sold_price numeric(12,2),
  commission_rate numeric(5,4),
  commission_amount numeric(12,2),
  delivered boolean default false,
  review_requested boolean default false,
  referral_asked boolean default false,
  created_at timestamptz default now()
);

create table inventory_snapshots (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id) on delete cascade,
  source text default 'IDMS',
  imported_at timestamptz default now(),
  raw_file_name text,
  row_count integer
);

create index leads_followup_idx on leads(user_id,next_follow_up_at);
create index leads_stage_idx on leads(user_id,stage);
create index vehicles_status_idx on vehicles(user_id,inventory_status);
create index listings_status_idx on listings(status);

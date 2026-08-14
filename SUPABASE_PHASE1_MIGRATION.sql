-- Phase 1: Leads cloud sync support
-- Run this once in Supabase > SQL Editor before testing the updated app.

alter table public.leads add column if not exists vehicle_name text;
alter table public.leads add column if not exists stock_number text;

create index if not exists leads_stock_number_idx on public.leads(stock_number);

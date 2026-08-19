-- Keys2AutoSales Marketplace vehicle-detail enrichment
-- Run once in Supabase SQL Editor.

alter table public.vehicles
  add column if not exists interior_color text,
  add column if not exists body_style text,
  add column if not exists vehicle_condition text,
  add column if not exists fuel_type text,
  add column if not exists transmission text,
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

comment on column public.vehicles.interior_color is 'Interior color used for Marketplace autofill';
comment on column public.vehicles.body_style is 'Body style used for Marketplace autofill';
comment on column public.vehicles.vehicle_condition is 'Vehicle condition used for Marketplace autofill';
comment on column public.vehicles.fuel_type is 'Fuel type used for Marketplace autofill';
comment on column public.vehicles.transmission is 'Transmission used for Marketplace autofill';
comment on column public.vehicles.photo_urls is 'Ordered JSON array of vehicle photo URLs for future Marketplace photo transfer';
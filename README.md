# Car Sales Command Center — Mobile Web App Prototype

This folder contains a working local prototype for the personal car-sales system.

## What the prototype does

The app has six primary areas:

1. **Dashboard** — today's leads, applications, appointments, ad actions, sold units, gross, and estimated commission.
2. **Inventory** — one master vehicle record with Stock #, VIN, mileage, price, photos, and status.
3. **Marketing** — Facebook Marketplace and Craigslist actions: POST, RENEW, UPDATE, REMOVE, or OK.
4. **Leads** — a GHL-style pipeline from New Lead through Sold/Lost.
5. **Tasks** — short daily priority queue.
6. **Deals & Income** — gross and commission calculations, including half deals.

The prototype stores data in the browser with `localStorage`. This is intentional for a quick proof-of-concept. The production version should move data to Supabase/Postgres.

## Workflow design

IDMS / DealerSocket
→ Master Vehicle Record
→ Facebook Marketplace + Craigslist listing records
→ Lead captured
→ GHL Contact / Opportunity
→ Credit Application
→ Appointment
→ Show
→ Working Deal
→ Sold
→ Gross + Commission
→ Review / Referral

### Inventory rules

- New vehicle + not posted → **POST**
- Listed price does not match dealer price → **UPDATE**
- Listing older than renewal threshold → **RENEW**
- Vehicle marked sold → **REMOVE**
- No photos → needs attention

### Lead rules

Recommended stages:

New Lead → Contacted → Qualified → Application Sent → Application Pending → Application Received → Appointment Set → Showed → Working Deal → Sold

Side stages:

No Show / Nurture / Lost

## Local prototype

Open `index.html` in a browser.

For full PWA behavior (install-to-home-screen and offline cache), host the folder over HTTPS. GitHub Pages, Netlify, Vercel, or Cloudflare Pages can all host a static prototype.

On iPhone, once hosted:
1. Open the HTTPS URL in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Open it from the new home-screen icon.

## IDMS import

The Inventory screen accepts a CSV file and tries to match common IDMS columns:

- Stock #
- Year
- Make
- Model / Trim
- Color
- VIN
- Status
- Price
- Mileage
- Pics / Photos

This is a prototype importer. Once an official DealerSocket export/API is available, replace the browser import with a server-side sync.

## GoHighLevel integration plan

Production version should use official HighLevel APIs/webhooks where your dealership account permissions allow it.

Suggested mapping:

- GHL Contact ID → `leads.ghl_contact_id`
- GHL Opportunity ID → `leads.ghl_opportunity_id`
- Appointment created → update `leads.appointment_at` and stage
- Application submitted → update `application_status`
- Deal marked sold → create `deals` row
- No show → move stage and create follow-up task

Do not collect SSNs or sensitive credit data in this app. Continue using the dealership's secure credit application link.

## Database

`schema.sql` contains a PostgreSQL/Supabase-ready schema for:
- users
- app settings
- vehicles
- platform listings
- leads
- tasks
- deals
- inventory snapshots

## Recommended production architecture

**Frontend:** Next.js or React PWA  
**Database/Auth:** Supabase (Postgres + Auth)  
**Automations:** server functions / scheduled jobs  
**GHL:** official API + webhooks  
**IDMS:** official API/data feed or scheduled export, if dealership authorizes it  
**Facebook Marketplace:** track listing status in-app; do not rely on unauthorized personal-account bots  
**Craigslist:** keep posting workflow compliant with Craigslist's supported posting controls

## Next development milestone

After validating this workflow, build Version 2 with:
- secure login
- cloud database
- GHL sync
- IDMS scheduled import/API
- lead notifications
- appointment notification cards
- vehicle photo handling
- duplicate vehicle/listing detection
- reporting by lead source
- production hosting


## Phase 1 cloud leads build

This updated build moves **Leads** to Supabase through a Vercel serverless API. Inventory, tasks, deals, marketing, and settings remain local for now.

Before deployment:
1. Run `SUPABASE_PHASE1_MIGRATION.sql` in the Supabase SQL Editor.
2. In Vercel Project Settings > Environment Variables, keep `SUPABASE_URL`.
3. Add `SUPABASE_SERVICE_ROLE_KEY` using the Supabase service-role secret. Keep this value private; never put it in browser code or share it in chat.
4. Redeploy the project.
5. Add a test lead, refresh the page, and confirm the row appears in Supabase > Table Editor > leads.

The existing `SUPABASE_ANON_KEY` may remain in Vercel, but this Phase 1 API does not use it.

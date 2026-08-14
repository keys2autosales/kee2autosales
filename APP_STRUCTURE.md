# App Structure

## Screens

### 1. Dashboard
Purpose: tell the salesperson exactly what deserves attention today.

Cards:
- Available inventory
- Ads needing action
- New leads
- Applications pending
- Appointments today
- Sold MTD
- Gross MTD
- Commission MTD

### 2. Inventory
Single source of truth for each vehicle.

Core fields:
- Stock #
- VIN
- year / make / model / trim
- mileage
- dealer price
- photo count
- IDMS status
- acquired date

### 3. Marketing
One listing record per vehicle per platform.

Platforms:
- Facebook Marketplace
- Craigslist

Actions:
- POST
- RENEW
- UPDATE
- REMOVE
- OK

### 4. Leads
Pipeline:
New Lead → Contacted → Qualified → Application Sent → Application Pending → Application Received → Appointment Set → Showed → Working Deal → Sold

Side states:
No Show / Nurture / Lost

### 5. Tasks
Short daily operating queue.

Task types:
Inventory / Facebook / Craigslist / Lead / Application / Appointment / Deal / Follow-Up

### 6. Deals
Tracks:
- source
- gross
- full vs half deal
- commission
- delivery
- review request
- referral request

## Data model relationships

Vehicle 1 ─── many Listings  
Vehicle 1 ─── many Leads  
Lead 0..1 ─── Deal  
Vehicle 0..1 ─── Deal  
Lead 1 ─── many Tasks  
Vehicle 1 ─── many Tasks  

## Production sync order

1. IDMS updates vehicle inventory.
2. App computes marketing action.
3. Marketplace/Craigslist status is updated in app when salesperson posts/renews/removes.
4. Lead enters GHL.
5. GHL webhooks/API update lead stage, application status, and appointment.
6. Sold deal updates commission dashboard.

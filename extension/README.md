# Keys2AutoSales Social Listing Assistant

Chrome extension for assisted Facebook Marketplace vehicle listing creation.

## Install locally in Chrome

1. Download or clone the `extension` folder from this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `extension` folder.
6. Keep the extension enabled while using Keys2AutoSales.

## Workflow

1. Open Keys2AutoSales and go to Inventory or Marketplace.
2. Choose a vehicle with a valid dealer price.
3. Click **Auto-Fill FB** or **Post to Marketplace**.
4. Keys2AutoSales opens Facebook Marketplace with a vehicle payload in the URL fragment.
5. The extension reads that payload and fills supported listing fields.
6. Review the listing, add/confirm photos and any Facebook-required selections, then publish manually.

## Current v0.1 fields

- Year
- Make
- Model
- Mileage/Odometer
- Price
- Description (including stock, VIN, financing language, booking link, and credit application link)

Facebook changes its Marketplace form over time, so selectors may need occasional maintenance. The extension intentionally does not store Facebook credentials and does not click the final Publish button.
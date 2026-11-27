# JO'S Grill

Responsive restaurant storefront and owner-only operations dashboard for JO'S Grill, Elelenwo, Rivers State.

## Stack

- Public storefront: HTML, CSS and browser JavaScript.
- Admin dashboard: /admin.html, Neon Managed Auth sign-in, owner-only authorization.
- Backend: Vercel Node.js Functions in /api.
- Database: Neon PostgreSQL, queried with pg.
- JWT verification: Neon Managed Auth JWKS + jose.

## Database

The Neon database is named JO's Grill. It reuses the existing order tables and adds:

- menu_items — item descriptions, categories, prices, images, publication and availability.
- store_profile — business contact details, delivery/pickup toggles, minimum order and preparation estimate.
- business_hours — opening and closing times for each weekday.
- delivery_zones — city/state delivery coverage, fees and minimums.
- payment_methods — payment instructions and bank-transfer details.
- Existing orders, order_items, and audit_log are retained and extended with delivery-fee confirmation, payment status, payment method and delivery method.

The six menu examples imported from the original concept are deliberately created as **draft and unavailable**. Confirm the real prices and availability in the admin dashboard before publishing them. Opening hours default to closed; no delivery zones or payment methods are invented.

## Vercel environment variables

Set these as encrypted environment variables for Production, Preview and Development:

- DATABASE_URL — Neon connection string for the JO's Grill database.
- AUTH_DATABASE_URL — Neon connection string for neondb, where Managed Auth stores user records.
- NEON_AUTH_JWKS_URL — Managed Auth JWKS URL used to verify login tokens.
- ADMIN_EMAIL — the one authorised restaurant owner email address.

ADMIN_EMAIL is intentionally not prefilled. Admin API access fails closed until the owner email is configured. After the owner creates an account at /admin.html, set ADMIN_EMAIL to that exact email in Vercel and redeploy. Other signed-in accounts cannot access the admin API.

Neon Auth is configured to trust https://jos-grill.vercel.app. Localhost is allowed by the existing Neon Auth configuration.

## Features

### Public website
- Menu is loaded from Neon; only published and available items are shown.
- Search and category filters.
- Cart totals are recalculated from database prices on the server.
- Checkout saves the order and its item snapshots to Neon before opening WhatsApp.
- Delivery fees are calculated only for an active matching city/state zone. Unmatched areas are marked for manual confirmation.
- The website does not collect online card payments.

### Admin dashboard
- Overview metrics and recent orders.
- Create, edit, publish, unpublish, enable, disable and delete menu items.
- Update business profile and public contact details.
- Configure opening hours for all seven days.
- Manage delivery zones, fees and minimum order amounts.
- Manage customer-facing payment methods and instructions.
- Review orders and update order status, payment status and confirmed delivery fees.
- Admin changes are recorded in audit_log.

## Local development

Install dependencies and run the project with Vercel CLI:

~~~bash
npm install
npx vercel dev
~~~

The static storefront is served from /; admin is /admin.html. Vercel Functions are served under /api.

## Operational notes

- Owner-only access is enforced on the server, not merely by hiding the dashboard UI.
- Do not expose either database connection string in browser code.
- Use ADMIN_EMAIL for one owner account initially; add staff roles only as a separately reviewed feature.
- Before accepting real orders, confirm menu details, delivery coverage, hours, and payment instructions in the admin dashboard.
- No real payment gateway is connected.

© 2026 JO'S Grill. Website crafted by SNT STUDIOS.

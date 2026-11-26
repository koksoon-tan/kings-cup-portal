# Kings Cup — Admin dashboard, player app & backend

This repo holds the Kings Cup business on Firebase: the staff dashboard (deck designs, inventory, orders from every sales channel, customers, access codes, corporate accounts) and the player web app that people use to play their decks.

```
admin/       Staff dashboard (React + Vite + Mantine)   → Firebase Hosting site "admin"
app/         Player web app (React + Vite, installable)  → Firebase Hosting site "play"
shared/      Card definitions + card renderer used by both apps
functions/   Cloud Functions (TypeScript)                → business logic that must be trusted
firestore.rules / storage.rules                          → per-role security
tests/emulator-e2e.mjs                                   → 55-check end-to-end test on the emulators
app/src/lib/game.test.ts                                 → game rules unit tests (npm test in app/)
```

## What's in it

| Area | What staff can do |
|---|---|
| **Dashboard** | Orders to fulfil, codes redeemed vs issued, low stock, sales by channel, corporate follow-ups due |
| **Deck designs** | In-house, corporate and external-designer decks. Upload a **zip of 55 images** (52 cards + 2 jokers + back), which is checked and turned into previews. Enter **action text per rank** in several languages. Set the **font** (upload TTF/OTF/WOFF), **colour**, outline, size and alignment. Drag on the preview to place the **text placeholder**, and override position or text for individual cards. Set release countries, app access (bundled with purchase / free / paid skin) and an expiry date. **Print export** downloads all 55 cards as full-resolution PNGs with the text added. |
| **Inventory** | SKUs with stock **per location** (warehouse, Shopee/Lazada fulfilment…). Stock in (PO, weighted-average cost), transfers, damage/loss/giveaways, corrections, **stock take**, low-stock alerts. **Channel allocation** caps how many units each channel can sell (limited runs). Every change is written to a **movement ledger**. |
| **Orders** | One list for Kickstarter, Shopee, Lazada, website, app, corporate and manual orders. **CSV import** recognises common column names from Kickstarter, BackerKit, Shopee and Lazada exports, and skips orders that were already imported. Status flow: pending → paid → packing → shipped → delivered → completed, plus cancelled / refunded / returned. Moving an order **reserves, deducts, releases or returns stock automatically**. |
| **Customers** | Contact details, source of purchase, orders, total spent, app code status, block from app. |
| **Serial codes** | **One code per customer**, generated when their order is paid (or by hand) and **emailed** to them. Each code tracks when it was generated, sent, delivered and **redeemed**, plus the device. Staff can resend, revoke, or revoke and reissue. Codes work once and can optionally expire. You can look up a code and export the list as CSV. |
| **Corporate** | Accounts, contacts, pipeline stage (lead → sample sent → negotiating → won → customer), follow-up dates. **Samples** (generic "Your Company Logo" deck, standard, mock-up) are tracked and deducted from stock. **Corporate orders** move quote → design → proof → deposit → production → ready → shipped → completed. Client design files and proof are uploaded, and **production is locked until the client approves the proof**. **Quotes and invoices** (deposit / balance / full) get numbered PDFs with tax, and partial payments are tracked. |
| **Settings** | Currency, auto-issue codes, code expiry, stock locations, company details for invoices, code email template. |
| **Staff** | Roles: `superadmin`, `admin`, `ops` (inventory, orders, customers, codes), `sales` (corporate, samples, invoices, customers). |
| **Audit log** | Who changed what, and when. |

Anything that touches stock, codes, order status or invoice numbers runs in Cloud Functions inside a transaction. The security rules stop the browser from writing those fields directly.

---

## 1. Run it locally (emulators — no Firebase project or cost)

Requirements: Node 22, Java 21+ (for the Firestore emulator), and `npm i -g firebase-tools`.

```bash
cd functions && npm install && npm run build && cd ..
cd admin && npm install && cd ..
firebase emulators:start --project demo-kingscup
```

In a second terminal:

```bash
cd functions
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node scripts/bootstrap-superadmin.js admin@example.com 'password123!' demo-kingscup
cd ../admin && npx vite --mode emulator
```

Open http://localhost:5173 and sign in as `admin@example.com` / `password123!`. The emulator UI at http://localhost:4000 shows the data, including the `mail` collection where code emails are queued.

Run the end-to-end test while the emulators are running:

```bash
node tests/emulator-e2e.mjs
```

## 2. Deploy to Firebase

1. **Create a project** in the [Firebase console](https://console.firebase.google.com). Choose the **Blaze** (pay-as-you-go) plan; Cloud Functions and Storage need it, but you only pay above the free quotas. **Set a budget alert** (Google Cloud console → Billing → Budgets) at, say, USD 10.
2. **Firestore**: create the database in **asia-southeast1 (Singapore)**. **Storage**: create the default bucket in the same region. If you pick another region, change `REGION` in `functions/src/common.ts` and `VITE_FUNCTIONS_REGION` in the admin `.env.local` to match.
3. **Authentication**: enable the **Email/Password** provider (for staff). Later, the mobile app will also use **custom tokens** (no setup needed) plus whatever providers you want customers to link (Google / Apple / email).
4. **Web app config**: Project settings → Your apps → add a Web app. Copy `admin/.env.example` to `admin/.env.local` and fill it in.
5. Point the CLI at your project:
   ```bash
   firebase use --add            # pick your project
   ```
6. **Email sending** — install the official **Trigger Email from Firestore** extension:
   ```bash
   firebase ext:install firebase/firestore-send-email
   ```
   - Collection: `mail`
   - SMTP connection URI from any provider. For example, Amazon SES, SendGrid, Brevo and Mailgun all have free or cheap tiers. Google Workspace SMTP also works for low volume.
   - Default FROM: e.g. `Kings Cup <hello@yourdomain.com>`. Set up SPF/DKIM for that domain so emails don't land in spam.

   The functions write the email to `mail/`. The extension sends it and reports delivery back, and the code's email status updates to *delivered* or *error* automatically.
7. **Allow custom tokens** (needed by `redeemSerialCode`): in Google Cloud console → IAM, give the **App Engine default / Compute default service account** that runs your functions the role **Service Account Token Creator**.
8. **Bucket CORS** (needed for the dashboard's print export and the player app's offline download): edit `cors.json` with both hosting domains, then
   ```bash
   gsutil cors set cors.json gs://YOUR-BUCKET
   ```
9. Create two Hosting sites (Firebase console → Hosting → Add another site), e.g. `kingscup-admin` and `kingscup-play`, then link them and deploy:
   ```bash
   firebase target:apply hosting admin kingscup-admin
   firebase target:apply hosting play kingscup-play
   (cd admin && npm run build) && (cd app && cp ../admin/.env.local .env.local && npm run build)
   firebase deploy
   ```
   You can connect your own domains (e.g. `admin.yourdomain.com`, `play.yourdomain.com`) under Hosting → Add custom domain.
10. Create the first superadmin (uses your own Google login):
    ```bash
    gcloud auth application-default login
    cd functions && node scripts/bootstrap-superadmin.js you@company.com 'a-strong-password' YOUR-PROJECT-ID
    ```
    Sign in at `https://YOUR-PROJECT-ID.web.app` and add the rest of the team under **Staff**.
11. Fill in **Settings → Company & invoices** and **Settings → General & stock**: locations, currency, and whether codes expire.

## 3. Day-to-day flow

1. **Deck designs → New deck.** Upload the zip, type the action text, pick the font and colour, and place the text box. Then **Print export** and send the zip to the printer.
2. **Inventory → New SKU** for the deck. When the print run arrives, record **Adjust stock → Stock in** with the PO number and unit cost.
3. **Orders → Import CSV** after Kickstarter closes, or for each Shopee/Lazada batch. Every paid buyer with an email gets an app code automatically. Shopee and Lazada exports usually hide buyer emails, so add them to the CSV or issue codes later from the customer's page.
4. Ship: open an order, click **Mark shipped**, and enter the tracking number. Stock is deducted.
5. **Corporate**: add a lead → **Record sample** → create a corporate order → upload design and proof → record the client's approval → deposit invoice → production → **Stock in** the corporate SKU → ship (stock deducted) → balance invoice → paid.

## 4. Player web app (`app/`)

**Flow:** splash → enter the one-time access code → deck library → game setup → play → summary.

- **Login:** the player types the code from their email (`redeemSerialCode`). The code is used up, and Firebase keeps them signed in on that device indefinitely. Every code for a customer signs into the same account (`cust_<customerId>`), so decks follow them to a new phone.
- **Lost code / new phone:** "Lost your code?" asks for their email and calls `requestAccessCode`. If it matches a customer, any unused code is cancelled and a new one is emailed. The answer is the same for unknown emails, and requests are limited to 3 an hour per email (10 per IP).
- **Blocking:** ticking "Blocked from the app" on a customer disables their app account and signs them out everywhere.
- **Card text:** comes from the global **Action text** page (`settings/actions`), which signed-in players can read; per-card overrides and the title style come from each deck.
- **Deck library:** published decks that are free, or that the customer owns. Decks with only some cards uploaded can still be played with the cards that have art. Ownership (`customers.ownedDeckIds`) is added automatically when an order for an SKU linked to the deck is paid. Staff can also add or remove decks on the customer page. The first time a deck is opened, all 55 card images (900px game versions) and its fonts are saved on the device, so games work offline.
- **Setup:** 2–12 players (optional names = turn order), language, jokers on/off, and whether the game ends on the last card or on the 4th King.
- **Play:** one shared device. A banner shows whose turn it is; tapping anywhere draws the next card, which flips with the deck's action text drawn by the same renderer as the dashboard preview. **Game effects** are set per card value on the dashboard's global **Action text** page ("In the player app" column): *Make a rule*, *Pick a mate*, *Becomes master* and *King's Cup* (fills the cup; the 4th one overflows). The pause menu has undo, skip, "At the table", how to play and end game. The game is saved after every card.
- **Installable:** it's a PWA, so players can add it to their home screen. The app shell works offline.

Run it locally against the emulators (create `app/.env.emulator` with the same values as the admin dashboard's, since `.env.*` files aren't committed):

```bash
cd app && npm install
npx vite --mode emulator --port 5174
```

**Demo build (no Firebase needed):** `npm run build:demo` in `app/` (or `npm run dev:demo`). It runs the real functions code in the browser with sample data: a circus deck, sample buyers and their codes, and shows the emails that would be sent.

## 5. Cost notes (why Firebase is a good fit at the start)

- With the free quotas (50k reads / 20k writes a day, 2M function calls a month, 5 GB storage), a launch-stage business typically pays **USD 0–5 a month**. Email costs depend on your SMTP provider.
- The deck zip processor is the heaviest function (2 GiB memory, a few seconds per upload), but it only runs when you upload art.
- Watch out for:
  - **Don't log every ad impression or app event as a Firestore write.** Use Google Analytics for Firebase when you add ads to the app.
  - **Reports.** Firestore is weak at ad-hoc reporting. When you need monthly P&L, aging or royalty reports, enable the **Stream Firestore to BigQuery** extension.
  - **In-app purchases** (paid skins): use RevenueCat and send its webhooks to a Cloud Function. Physical-deck orders placed inside the app can use a normal payment gateway instead of Apple/Google billing.

## 6. Not built yet (next phases from the Miro board)

- **Ads management** (advertisers, banners, placements, impressions)
- **External designer** submissions portal and **royalty payouts** (decks already store designer and royalty %)
- **Paid deck/skin purchases inside the player app** (decks marked "Paid skin" show as locked for now)
- **Shopee / Lazada / courier API** sync (CSV import covers it for now)
- **CMS** pages (About Us, FAQ), social links, and the Google Review prompt
- Malaysia **MyInvois e-invoicing** submission: invoices carry tax ID and SST today, but they aren't submitted to LHDN. Check with your accountant when this becomes mandatory for your revenue level.

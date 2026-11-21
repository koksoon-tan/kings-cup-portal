# Kings Cup — Admin dashboard & backend

This repo holds the admin side of the Kings Cup business: deck designs, inventory, orders from every sales channel, customers, app serial codes, and corporate (B2B) accounts. It runs on Firebase. The mobile app isn't built yet, but the endpoint it needs to redeem codes is already here.

```
admin/       React + Vite + Mantine dashboard  → Firebase Hosting
functions/   Cloud Functions (TypeScript)       → business logic that must be trusted
firestore.rules / storage.rules                 → per-role security
tests/emulator-e2e.mjs                          → 45-check end-to-end test on the emulators
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
8. **Bucket CORS** (needed for print export, which reads the full-resolution art in the browser): edit `cors.json` with your hosting domains, then
   ```bash
   gsutil cors set cors.json gs://YOUR-BUCKET
   ```
9. Deploy everything:
   ```bash
   cd admin && npm run build && cd ..
   firebase deploy
   ```
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

## 4. Connecting the mobile app later

```ts
// Customer types the code from their email
const { data } = await httpsCallable(functions, "redeemSerialCode")({ code, device: "iPhone 16 / iOS 26" });
await signInWithCustomToken(auth, data.token);        // uid = "cust_<customerId>", claim customerId
// Then ask them to link a permanent login so a new phone still works:
await linkWithCredential(auth.currentUser, googleOrAppleOrEmailCredential);
```

- The code is **single-use**. After redemption the customer signs in with the provider they linked.
- Turn on **App Check** in the app and set `enforceAppCheck: true` on `redeemSerialCode` (in `functions/src/codes.ts`). Failed attempts are already rate-limited to 10 per hour per IP.
- The app can already read **published** decks (`decks` where `status == "published"`) and their art under `decks/*/art/**`. It should draw the action text on the card itself using `actions`, `textStyle` and `cardOverrides`. `admin/src/lib/render.ts` is the reference renderer to copy.

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
- **App skins catalogue / unlock tracking** inside the app, and RevenueCat webhooks
- **Shopee / Lazada / courier API** sync (CSV import covers it for now)
- **CMS** pages (About Us, FAQ), social links, and the Google Review prompt
- Malaysia **MyInvois e-invoicing** submission: invoices carry tax ID and SST today, but they aren't submitted to LHDN. Check with your accountant when this becomes mandatory for your revenue level.

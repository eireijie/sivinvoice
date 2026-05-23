# SIV Project Handoff

This file compresses the working knowledge for SIV into one place.

## Product

SIV is an invoice vault for small stores. The core promise is simple: upload invoices, save the original files, extract line items, and make years of invoice records searchable without digging through paper.

The app is not meant to be only inspection-focused. It should feel like a secure, everyday business archive for invoices, vendors, bottle/product history, and records.

Branding:

- Public name: `SIV`
- Do not expand the name in customer-facing UI.
- Visual direction: Deep navy, emerald, white.
- Tone: professional, clear, less AI-looking, less hype.

## Current Stack

- App: Next.js App Router
- Auth: Supabase Auth
- Database: Supabase Postgres
- File storage: Supabase Storage
- OCR: Google Vision API
- AI extraction: OpenAI
- Payments: Stripe test/sandbox foundation exists
- Hosting target: Vercel
- Repo: `https://github.com/eireijie/sivinvoice.git`
- Production URL: `https://sivinvoice.vercel.app/`

## Main Workflow

1. User uploads a PDF, image, or multiple photos for one invoice record.
2. Original files are stored in Supabase Storage.
3. OCR runs against each file/page.
4. OCR text is parsed into invoice metadata and product-level line items.
5. User reviews/corrects the invoice.
6. Saved line items become searchable by product name, partial name, size, SKU, UPC, vendor, and date.
7. Search results link back to the original invoice.

Important current rule:

- `Upload Invoice` treats all attached files as one invoice record, even if the images contain multiple invoice numbers.
- The parser should still extract all bottle/product rows from every attached file.
- `Batch Upload` is the workflow intended for scanned stacks or separate invoices, but it has been confusing and needs more polish.

## Core Tables

Expected tables:

- `organizations`
- `organization_members`
- `stores`
- `vendors`
- `invoices`
- `invoice_line_items`
- `product_aliases`
- `invoice_batches`
- `batch_detected_invoices`

Important line item fields:

- `invoice_id`
- `product_name_raw`
- `product_name_normalized`
- `brand`
- `bottle_name`
- `size`
- `pack_size`
- `quantity`
- `unit_cost`
- `total_cost`
- `sku`
- `upc`
- `confidence_score`

## Environment Variables

Local file:

```bash
.env.local
```

Common required values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=invoices
GOOGLE_VISION_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

Stripe-related values exist for billing work:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_FREE=
STRIPE_PRICE_PRO=
STRIPE_PRICE_MAX=
```

Never commit real `.env.local` secrets.

## Storage

Original invoices are stored in Supabase Storage, usually in the `invoices` bucket.

Storage payloads are referenced from `invoices.ocr_text` as JSON. Processed uploads usually look like:

```json
{
  "kind": "processed_upload",
  "text": "OCR text...",
  "files": [
    {
      "path": "storage/path/file.jpg",
      "fileName": "image.jpg",
      "mimeType": "image/jpeg"
    }
  ]
}
```

Queued uploads use:

```json
{
  "kind": "pending_upload",
  "pendingFiles": []
}
```

## Current Upload Paths

Normal upload:

- `app/upload/page.js`
- `app/api/upload/route.js`
- `lib/invoices.js`

QR/mobile upload:

- `app/mobile-upload/mobile-upload-client.js`
- `app/api/mobile-upload/sign/route.js`
- `app/api/mobile-upload/complete/route.js`

QR invoice upload now uploads directly to Supabase Storage through signed upload URLs, then creates a queued invoice record.

Batch upload:

- `app/batches/page.js`
- `app/api/batches/route.js`
- `lib/batches.js`

## OCR And Parsing

OCR:

- Main OCR function: `lib/ocr.js`
- Images use Google Vision `DOCUMENT_TEXT_DETECTION`.
- PDFs use Google Vision PDF page OCR.

AI/parser:

- Main parser: `lib/aiParser.js`
- Uses OpenAI when `OPENAI_API_KEY` is present.
- Falls back to heuristic parsing when OpenAI is missing.
- Includes a recovery pass for RNDC/Republic National invoice blocks.

Recent fix:

- RNDC invoices often show line items as product text followed by `ITEM#:... PACK:... S:... UPC:...` and later price lines.
- The parser now recovers those `ITEM#` blocks even when the AI model misses them.
- Multi-photo upload remains one invoice record even if multiple invoice numbers appear.

## Known Brandywine Case

User account:

```text
brandywine.liquor@yahoo.com
```

Auth user id:

```text
f0f0a618-2627-4e0e-8591-59bde7da4a4e
```

Important issue found:

- This account had multiple organization memberships created.
- Invoices were under organization `ed7ee67a-9bca-4455-8adc-3f892c82e018`.
- Other blank organizations existed with no invoices.
- This suggests account/workspace creation should be tightened so duplicate blank workspaces are not created.

Recent repaired records:

- Invoice record `fde97cd7-7f5a-4394-b86c-6e910734e978`
  - Invoice number shown as `5723806, 5723805`
  - Date `2025-12-17`
  - Total `4501.14`
  - Line items updated to `23`

- Invoice record `cde7bd4b-ab49-45e0-ae8f-51f5ef2fecf7`
  - Invoice number shown as `5728321, 5728320, 5728319, 5728318`
  - Date `2025-12-23`
  - Total `4640.91`
  - Line items updated to `34`

## Billing And Plans

The product direction is two paid plans plus some free/testing access.

Earlier discussed plan shape:

- Free
  - Basic uploads
  - Limited storage, roughly 5 GB
  - No phone QR upload
  - No batch/pro workflows

- Pro
  - More storage
  - Phone QR upload
  - Faster queue priority
  - Better monthly limits
  - Intended for a single store

- Max
  - Highest storage/usage limits
  - Faster queue priority
  - Multi-store/team-friendly
  - Best for heavier operators

Current billing still feels prototype-like. The user wants it to feel more like ChatGPT billing: clean plan card, current plan, payment method, invoices, change/cancel plan, without exposing internal names like Stripe or Supabase.

## UI Direction

User prefers:

- Professional business software, not a toy.
- Less AI-sounding copy.
- Homepage should sell invoice storage and easy access, not only inspections.
- Mobile/phone POS view must be less clunky.
- Tables need usable horizontal scrolling when the viewport is narrow.
- Sidebar should support collapse/expand and eventually configurable vertical/horizontal layout.

Current sidebar expectations:

- Business name at the top.
- Settings near the bottom.
- No visible user email pill in topbar.
- Guide/tour should be less intrusive.

## Security Direction

Important product/security goals:

- User/customer data must be private.
- Code and database credentials must be private.
- Use RLS correctly.
- Support access should be explicit: customer can turn support access on/off.
- Admin page can exist later, but it must only show customer data when support access is enabled or when proper admin authorization exists.
- Never share or bypass a customer password.
- For support access, implement an auditable admin/support impersonation or read-only support mode.

## Backup

Backup script:

```bash
npm run backup:supabase
```

Script file:

```bash
scripts/backup-supabase.mjs
```

It exports database table data and storage files into `backups/`.

Recent backup created:

```text
backups/2026-05-22T22-24-16-627Z
```

Recent backup stats:

- organizations: 106
- organization_members: 12
- stores: 34
- vendors: 37
- invoice_batches: 14
- invoices: 137
- invoice_line_items: 1986
- product_aliases: 3
- batch_detected_invoices: 19
- storage files: 185
- storage bytes: 196099291

Code snapshot:

```text
backups/code/siv-code-20260522-182407.tar.gz
```

`backups/` is ignored by git.

## Deployment

GitHub:

```bash
git push origin main
```

Vercel should redeploy from `main`.

Production environment variables must be added in Vercel Project Settings under Environment Variables.

Common production issue:

- Supabase email verification links pointed to localhost.
- Fix in Supabase Auth URL settings:
  - Site URL should be production URL.
  - Redirect URLs should include production auth URLs.

## Commands

Development:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Backup:

```bash
npm run backup:supabase
```

## Recent Commits

Recent relevant commits:

- `3654ff9 Add Supabase backup script`
- `682de61 Restore simple invoice upload flow`
- `1fbbc3c Show upload endpoint failures`
- `b2b32b9 Upload QR invoices directly to storage`
- `ea36936 Improve RNDC multi-photo invoice extraction`

## Known Problems / Next Work

High priority:

- Fix duplicate blank organizations/workspaces for the same account.
- Make upload processing reliable in the background, not dependent on opening review pages.
- Add a real queue system for OCR/AI jobs.
- Improve batch upload UX so it is clear which detected invoice is which.
- Make delete invoice reliable for all statuses, including duplicates and unsaved detected invoices.
- Improve mobile upload and mobile review screens.
- Add plan enforcement so free users cannot access Pro/Max features like phone upload.
- Make billing upgrade/cancel/test payments feel real.
- Add support-access toggle and admin/support dashboard.
- Add better error messages for OCR/API failures.

Performance goal:

- Small invoices should usually process in around 30 seconds.
- Larger image batches should process in the background with visible queue status.
- Pro/Max should get higher queue priority or more concurrent processing.

Potential production architecture:

- Keep Next.js on Vercel initially.
- Keep Supabase hosted while starting, unless self-hosting becomes necessary.
- Add a worker/queue service for OCR and AI parsing when volume grows.
- Store originals in Supabase Storage or S3-compatible storage.
- Add scheduled backups and monitoring before real customers rely on it.


# SIV

SIV is a secure invoice vault for stores: upload invoice files, keep originals safe, and search years of invoice records quickly.

## V1 capabilities

- Upload invoice PDFs or images.
- Store the original invoice in Supabase Storage.
- Run OCR with Google Vision when `GOOGLE_VISION_API_KEY` is set.
- Extract invoice line items with OpenAI when `OPENAI_API_KEY` is set.
- Review and correct invoice metadata and extracted line items.
- Search by product name, partial name, size, SKU, UPC, and fuzzy variations.
- Open the original invoice from every search result.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create a private Storage bucket named `invoices`, or set `SUPABASE_STORAGE_BUCKET`.
4. Copy `.env.example` to `.env.local` and fill in Supabase values.
5. Optional: add `GOOGLE_VISION_API_KEY` and `OPENAI_API_KEY`.

Without OCR or AI keys, uploads still create reviewable demo extraction data so the workflow can be tested.

## SaaS foundation

- Every account is assigned to an organization workspace.
- Stores, vendors, invoices, batches, product aliases, and searches are scoped by organization.
- Supabase Row Level Security is enabled for the application tables.
- New users get their own workspace automatically on first protected app access.

## Self-hosting Supabase

Keep the Supabase architecture and point the app at a self-hosted Supabase stack when ready. See `docs/self-host-supabase.md` for the migration checklist and production notes.

## Commands

```bash
npm run dev
npm run build
```

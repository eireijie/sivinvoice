# SIV Production Launch Plan

This is the working path from local prototype to public SaaS.

## Phase 1: Production Foundation

- Deploy the Next.js app to Vercel or a VPS.
- Add a custom domain with HTTPS.
- Move all secrets into production environment variables.
- Keep Supabase Auth, Postgres, and Storage as the system of record.
- Add daily database backups and storage backup policy.

## Phase 2: Billing

- Create Stripe products for Starter, Pro, and Multi-store.
- Add Stripe Checkout for new subscriptions.
- Add Stripe Billing Portal for card changes and cancellations.
- Store subscription status on each workspace.
- Gate usage by plan: stores, monthly OCR pages, batch uploads, and users.

## Phase 3: Team Accounts

- Add team invites by email.
- Add roles: owner, admin, reviewer, read-only.
- Add audit log entries for uploads, deletes, review saves, and duplicate handling.

## Phase 4: Invoice Reliability

- Add duplicate scoring using invoice number, date, vendor, store, total, file hash, and line-item similarity.
- Add queue-based OCR jobs so large uploads keep running after the browser closes.
- Add retry handling for OCR and AI parser failures.
- Add export tools for invoice history and bottle cost history.

## Phase 5: Public Launch

- Add privacy policy and terms.
- Add support email and onboarding docs.
- Add usage dashboard for OCR pages, uploads, and storage.
- Monitor API errors, OCR failures, and slow invoice parsing.

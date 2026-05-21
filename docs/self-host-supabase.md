# Self-Host Supabase Runbook

SIV can keep using Supabase while moving from the hosted Supabase project to a self-hosted Supabase stack. The app only depends on Auth, Postgres, Storage, and the REST/RPC API, so the migration path is straightforward.

## Recommended path

1. Keep the hosted Supabase project for development until subscriptions, billing, and onboarding are stable.
2. Stand up self-hosted Supabase on a VPS or managed Docker host.
3. Run `supabase/schema.sql` against the self-hosted Postgres database.
4. Create the private `invoices` storage bucket.
5. Point the app environment variables at the self-hosted Supabase URL and keys.
6. Export/import production data only after the hosted app is quiet or in a maintenance window.

## Minimum server

- 2 vCPU / 4 GB RAM for early pilots.
- 4 vCPU / 8 GB RAM once OCR uploads and multiple stores are active.
- Daily Postgres backups.
- Object storage backups for invoice PDFs.
- HTTPS in front of Supabase and Next.js.

## Environment variables

For a self-hosted Supabase stack, these values change:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://supabase.yourdomain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-self-hosted-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-self-hosted-service-role-key
SUPABASE_STORAGE_BUCKET=invoices
```

These stay separate from Supabase:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
GOOGLE_VISION_API_KEY=
```

## Database setup

Run the full schema from the repo:

```bash
supabase/schema.sql
```

The schema includes:

- Organizations and organization memberships.
- Organization-scoped stores, vendors, invoices, batches, and product aliases.
- Row Level Security policies.
- Fuzzy bottle search with trigram and full-text indexes.
- The private `invoices` storage bucket.

## Production notes

- Do not expose the service role key in the browser. It belongs only in server-side environment variables.
- Rotate keys after moving from a local prototype to public hosting.
- Use a custom SMTP provider for Auth emails before public launch.
- Add Stripe subscriptions before opening signup broadly.
- Keep OCR/AI processing server-side only.

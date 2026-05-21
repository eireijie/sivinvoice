create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  subscription_plan text not null default 'free',
  subscription_status text not null default 'active',
  billing_customer_id text,
  billing_subscription_id text,
  billing_current_period_end timestamptz,
  created_at timestamptz not null default now()
);

alter table organizations add column if not exists subscription_plan text not null default 'free';
alter table organizations add column if not exists subscription_status text not null default 'active';
alter table organizations add column if not exists billing_customer_id text;
alter table organizations add column if not exists billing_subscription_id text;
alter table organizations add column if not exists billing_current_period_end timestamptz;
alter table invoice_batches add column if not exists original_file_size_bytes bigint not null default 0;
alter table invoice_batches add column if not exists processing_priority integer not null default 0;
alter table invoices add column if not exists original_file_size_bytes bigint not null default 0;

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists invoice_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  original_file_path text not null,
  original_file_name text not null,
  original_file_sha256 text,
  original_file_size_bytes bigint not null default 0,
  mime_type text not null,
  status text not null default 'detected',
  processing_priority integer not null default 0,
  ocr_provider text,
  page_count integer,
  ocr_text text,
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  invoice_number text not null,
  invoice_date date,
  invoice_total numeric,
  original_file_path text not null,
  original_file_name text,
  original_file_sha256 text,
  original_file_size_bytes bigint not null default 0,
  mime_type text,
  ocr_text text,
  ocr_provider text,
  parse_status text not null default 'needs_review',
  duplicate_of_invoice_id uuid references invoices(id) on delete set null,
  reviewed_at timestamptz,
  source_batch_id uuid references invoice_batches(id) on delete set null,
  source_page_start integer,
  source_page_end integer,
  created_at timestamptz not null default now()
);

create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_name_raw text not null,
  product_name_normalized text not null,
  brand text,
  bottle_name text,
  size text,
  pack_size numeric,
  quantity numeric not null default 0,
  unit_cost numeric,
  total_cost numeric,
  sku text,
  upc text,
  confidence_score numeric,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(product_name_normalized, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(bottle_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(size, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(sku, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(upc, '')), 'C')
  ) stored,
  created_at timestamptz not null default now()
);

create table if not exists product_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  canonical_name text not null,
  alias text not null,
  alias_normalized text not null,
  created_at timestamptz not null default now()
);

create table if not exists batch_detected_invoices (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references invoice_batches(id) on delete cascade,
  page_start integer,
  page_end integer,
  vendor_name text,
  store_name text,
  invoice_number text,
  invoice_date date,
  invoice_total numeric,
  confidence_score numeric,
  status text not null default 'detected',
  parsed_payload jsonb not null default '{}'::jsonb,
  created_invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_line_items_search_idx on invoice_line_items using gin(search_vector);
create index if not exists invoice_line_items_name_trgm_idx on invoice_line_items using gin(product_name_normalized gin_trgm_ops);
create index if not exists invoice_line_items_bottle_trgm_idx on invoice_line_items using gin(bottle_name gin_trgm_ops);
create index if not exists invoice_line_items_sku_idx on invoice_line_items(sku);
create index if not exists invoice_line_items_upc_idx on invoice_line_items(upc);
create unique index if not exists stores_org_name_key on stores(organization_id, name);
create unique index if not exists vendors_org_name_key on vendors(organization_id, name);
create unique index if not exists product_aliases_org_alias_key on product_aliases(organization_id, alias);
create index if not exists stores_org_idx on stores(organization_id);
create index if not exists vendors_org_idx on vendors(organization_id);
create index if not exists invoices_org_created_idx on invoices(organization_id, created_at desc);
create index if not exists invoice_batches_org_created_idx on invoice_batches(organization_id, created_at desc);
create index if not exists invoices_org_file_size_idx on invoices(organization_id, original_file_size_bytes);
create index if not exists invoice_batches_org_file_size_idx on invoice_batches(organization_id, original_file_size_bytes);
create index if not exists invoice_batches_org_priority_idx on invoice_batches(organization_id, processing_priority desc, created_at desc);
create index if not exists product_aliases_org_alias_normalized_idx on product_aliases using gin(alias_normalized gin_trgm_ops);
create index if not exists invoices_date_idx on invoices(invoice_date desc);
create index if not exists invoices_file_sha256_idx on invoices(original_file_sha256);
create index if not exists batch_detected_invoices_batch_idx on batch_detected_invoices(batch_id);
create index if not exists invoices_source_batch_idx on invoices(source_batch_id);
create index if not exists invoice_batches_file_sha256_idx on invoice_batches(original_file_sha256);

create or replace function is_org_member(active_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = active_organization_id
      and user_id = auth.uid()
  );
$$;

drop function if exists search_invoice_line_items(text, text);

create or replace function search_invoice_line_items(search_term text, normalized_term text, active_organization_id uuid)
returns table (
  line_item_id uuid,
  invoice_id uuid,
  product_name_raw text,
  product_name_normalized text,
  brand text,
  bottle_name text,
  size text,
  pack_size numeric,
  quantity numeric,
  unit_cost numeric,
  total_cost numeric,
  sku text,
  upc text,
  confidence_score numeric,
  vendor_name text,
  store_name text,
  invoice_date date,
  invoice_number text,
  original_file_path text,
  rank numeric
)
language sql
stable
as $$
  with alias_matches as (
    select canonical_name
    from product_aliases
    where organization_id = active_organization_id
      and (
        alias_normalized % normalized_term
        or alias_normalized ilike '%' || normalized_term || '%'
      )
  )
  select
    li.id,
    i.id,
    li.product_name_raw,
    li.product_name_normalized,
    li.brand,
    li.bottle_name,
    li.size,
    li.pack_size,
    li.quantity,
    li.unit_cost,
    li.total_cost,
    li.sku,
    li.upc,
    li.confidence_score,
    v.name,
    s.name,
    i.invoice_date,
    i.invoice_number,
    i.original_file_path,
    greatest(
      ts_rank(li.search_vector, plainto_tsquery('simple', coalesce(normalized_term, ''))),
      similarity(li.product_name_normalized, normalized_term),
      similarity(coalesce(li.bottle_name, ''), search_term),
      case when li.sku = search_term or li.upc = search_term then 1 else 0 end,
      case when li.size ilike '%' || search_term || '%' then .72 else 0 end
    )::numeric as rank
  from invoice_line_items li
  join invoices i on i.id = li.invoice_id
  left join vendors v on v.id = i.vendor_id
  left join stores s on s.id = i.store_id
  where
    i.organization_id = active_organization_id
    and i.duplicate_of_invoice_id is null
    and i.parse_status <> 'duplicate'
    and (
      li.search_vector @@ plainto_tsquery('simple', coalesce(normalized_term, ''))
      or li.product_name_normalized % normalized_term
      or li.product_name_normalized ilike '%' || normalized_term || '%'
      or coalesce(li.bottle_name, '') % search_term
      or coalesce(li.size, '') ilike '%' || search_term || '%'
      or li.sku = search_term
      or li.upc = search_term
      or li.product_name_normalized in (select canonical_name from alias_matches)
    )
  order by rank desc, i.invoice_date desc nulls last
  limit 100;
$$;

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table stores enable row level security;
alter table vendors enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
alter table invoice_batches enable row level security;
alter table batch_detected_invoices enable row level security;
alter table product_aliases enable row level security;

drop policy if exists organizations_member_access on organizations;
drop policy if exists organization_members_self_access on organization_members;
drop policy if exists stores_org_access on stores;
drop policy if exists vendors_org_access on vendors;
drop policy if exists invoices_org_access on invoices;
drop policy if exists invoice_line_items_org_access on invoice_line_items;
drop policy if exists invoice_batches_org_access on invoice_batches;
drop policy if exists batch_detected_invoices_org_access on batch_detected_invoices;
drop policy if exists product_aliases_org_access on product_aliases;

drop policy if exists "organization members can read organizations" on organizations;
create policy "organization members can read organizations"
on organizations for select
using (is_org_member(id));

drop policy if exists "owners can manage organizations" on organizations;
create policy "owners can manage organizations"
on organizations for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "members can read memberships" on organization_members;
create policy "members can read memberships"
on organization_members for select
using (is_org_member(organization_id));

drop policy if exists "owners can manage memberships" on organization_members;
create policy "owners can manage memberships"
on organization_members for all
using (
  exists (
    select 1 from organizations
    where organizations.id = organization_members.organization_id
      and organizations.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from organizations
    where organizations.id = organization_members.organization_id
      and organizations.owner_user_id = auth.uid()
  )
);

drop policy if exists "members can manage stores" on stores;
create policy "members can manage stores"
on stores for all
using (is_org_member(organization_id))
with check (is_org_member(organization_id));

drop policy if exists "members can manage vendors" on vendors;
create policy "members can manage vendors"
on vendors for all
using (is_org_member(organization_id))
with check (is_org_member(organization_id));

drop policy if exists "members can manage invoices" on invoices;
create policy "members can manage invoices"
on invoices for all
using (is_org_member(organization_id))
with check (is_org_member(organization_id));

drop policy if exists "members can manage invoice line items" on invoice_line_items;
create policy "members can manage invoice line items"
on invoice_line_items for all
using (
  exists (
    select 1 from invoices
    where invoices.id = invoice_line_items.invoice_id
      and is_org_member(invoices.organization_id)
  )
)
with check (
  exists (
    select 1 from invoices
    where invoices.id = invoice_line_items.invoice_id
      and is_org_member(invoices.organization_id)
  )
);

drop policy if exists "members can manage invoice batches" on invoice_batches;
create policy "members can manage invoice batches"
on invoice_batches for all
using (is_org_member(organization_id))
with check (is_org_member(organization_id));

drop policy if exists "members can manage detected batch invoices" on batch_detected_invoices;
create policy "members can manage detected batch invoices"
on batch_detected_invoices for all
using (
  exists (
    select 1 from invoice_batches
    where invoice_batches.id = batch_detected_invoices.batch_id
      and is_org_member(invoice_batches.organization_id)
  )
)
with check (
  exists (
    select 1 from invoice_batches
    where invoice_batches.id = batch_detected_invoices.batch_id
      and is_org_member(invoice_batches.organization_id)
  )
);

drop policy if exists "members can manage product aliases" on product_aliases;
create policy "members can manage product aliases"
on product_aliases for all
using (is_org_member(organization_id))
with check (is_org_member(organization_id));

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

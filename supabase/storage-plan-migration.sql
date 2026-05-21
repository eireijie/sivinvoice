alter table invoices add column if not exists original_file_size_bytes bigint not null default 0;
alter table invoice_batches add column if not exists original_file_size_bytes bigint not null default 0;
alter table invoice_batches add column if not exists processing_priority integer not null default 0;

create index if not exists invoices_org_file_size_idx on invoices(organization_id, original_file_size_bytes);
create index if not exists invoice_batches_org_file_size_idx on invoice_batches(organization_id, original_file_size_bytes);
create index if not exists invoice_batches_org_priority_idx on invoice_batches(organization_id, processing_priority desc, created_at desc);

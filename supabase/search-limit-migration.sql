drop function if exists search_invoice_line_items(text, text);
drop function if exists search_invoice_line_items(text, text, uuid);
drop function if exists search_invoice_line_items(text, text, uuid, integer);

create or replace function search_invoice_line_items(search_term text, normalized_term text, active_organization_id uuid, result_limit integer default 1000)
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
  limit least(greatest(coalesce(result_limit, 1000), 1), 10000);
$$;

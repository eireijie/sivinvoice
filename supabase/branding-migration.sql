alter table organizations add column if not exists logo_path text;
alter table organizations add column if not exists brand_primary text not null default '#009b72';
alter table organizations add column if not exists brand_secondary text not null default '#22c58f';
alter table organizations add column if not exists brand_theme text not null default 'siv';

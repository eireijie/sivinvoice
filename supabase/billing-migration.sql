alter table organizations add column if not exists subscription_plan text not null default 'free';
alter table organizations add column if not exists subscription_status text not null default 'active';
alter table organizations add column if not exists billing_customer_id text;
alter table organizations add column if not exists billing_subscription_id text;
alter table organizations add column if not exists billing_current_period_end timestamptz;

-- TITI GOLD — enquiries table
-- Stores website enquiries for all three businesses.
--
-- Access model:
--   * Only the website's server function writes here, using the project's
--     SECRET key (service_role), which bypasses RLS.
--   * The public (anon) and signed-in (authenticated) roles get NO access.
--     RLS is enabled with no policies, so even if grants change by mistake,
--     no rows are readable or writable through the public API.
--   * Read enquiries in the Supabase dashboard (Table Editor) or via SQL.

create table if not exists public.enquiries (
  id            bigint generated always as identity primary key,
  reference     text        not null unique,
  created_at    timestamptz not null default now(),

  business      text        not null check (business in ('events', 'foundation', 'fashion')),
  business_name text        not null,
  enquiry_type  text        not null check (char_length(enquiry_type) <= 120),

  name          text        not null check (char_length(name) between 2 and 120),
  email         text        not null check (char_length(email) <= 254),
  phone         text                 check (char_length(phone) <= 40),

  event_date    date,
  budget        text                 check (char_length(budget) <= 60),
  guests        text                 check (char_length(guests) <= 60),
  organisation  text                 check (char_length(organisation) <= 160),
  location      text                 check (char_length(location) <= 200),
  product       text                 check (char_length(product) <= 200),
  quantity      text                 check (char_length(quantity) <= 100),

  message       text        not null check (char_length(message) between 10 and 4000),
  consent       boolean     not null default false,

  -- Workflow fields for the team
  status        text        not null default 'new' check (status in ('new', 'in_progress', 'replied', 'closed', 'spam')),
  notes         text,

  source        text,
  user_agent    text
);

comment on table public.enquiries is 'Website enquiries for TITIGOLD Project and Event Management, Foundation and Fashion Hub.';

-- Most common views: newest first, optionally filtered by business or status.
create index if not exists enquiries_created_at_idx on public.enquiries (created_at desc);
create index if not exists enquiries_business_created_idx on public.enquiries (business, created_at desc);
create index if not exists enquiries_open_idx on public.enquiries (created_at desc) where status in ('new', 'in_progress');

alter table public.enquiries enable row level security;

-- Lock the table away from the public Data API roles; only the server writes.
revoke all on table public.enquiries from anon, authenticated;
grant select, insert, update on table public.enquiries to service_role;

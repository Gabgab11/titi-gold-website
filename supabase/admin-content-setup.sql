-- Titi Gold admin: books, editable site text and theme colours.
-- Run once in the TITIGOLD project's SQL Editor (after blog-setup.sql).

-- Books -----------------------------------------------------------------
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  cover_url text,
  buy_url text,
  sort_order int not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.books enable row level security;
create policy "Anyone can read published books; admins read all" on public.books for select
  using (status = 'published' or public.is_admin());
create policy "Admins write books insert" on public.books for insert with check (public.is_admin());
create policy "Admins write books update" on public.books for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins write books delete" on public.books for delete using (public.is_admin());

-- Live site text and colours (public read) ------------------------------
create table if not exists public.site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
create policy "Anyone can read site content" on public.site_content for select using (true);
create policy "Admins write site content" on public.site_content for all using (public.is_admin()) with check (public.is_admin());

-- Drafts (admins only) --------------------------------------------------
create table if not exists public.site_content_draft (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.site_content_draft enable row level security;
create policy "Admins manage drafts" on public.site_content_draft for all using (public.is_admin()) with check (public.is_admin());

-- Publish: copy every draft into the live site --------------------------
create or replace function public.publish_site_content()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can publish';
  end if;
  insert into public.site_content (key, value, updated_at)
  select key, value, now() from public.site_content_draft
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
grant execute on function public.publish_site_content() to authenticated;

-- Starting books (the two published books) ------------------------------
insert into public.books (slug, title, subtitle, description, cover_url, sort_order, status) values
  ('heralding-glory', 'Heralding Glory', 'A Memoir', 'A work reflecting my passion for faith, spiritual growth, and the pursuit of God''s purpose.', 'assets/img/books/heralding-glory.jpg', 1, 'published'),
  ('dance-of-waiting', 'The Dance of Waiting', 'Moving to God''s Beat', 'A reminder that waiting is not wasted time, and that growth often happens when we learn to trust God''s timing and remain faithful through every season.', 'assets/img/books/dance-of-waiting.jpg', 2, 'published')
on conflict (slug) do nothing;

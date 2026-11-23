-- Titi Gold: blog, image library and admin access.
-- Run once in the Supabase SQL Editor for the TITIGOLD project.
-- Only the emails listed in public.admins can write. Everyone can read published posts.

create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- No policies on purpose: nobody can read or change this list through the public API.
insert into public.admins (email) values ('africancarbontech@gmail.com') on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (length(title) between 1 and 200),
  excerpt text not null default '',
  body text not null default '',
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.posts enable row level security;

create policy "Anyone can read published posts; admins read everything"
  on public.posts for select
  using (status = 'published' or public.is_admin());
create policy "Admins can create posts"
  on public.posts for insert
  with check (public.is_admin());
create policy "Admins can edit posts"
  on public.posts for update
  using (public.is_admin())
  with check (public.is_admin());
create policy "Admins can delete posts"
  on public.posts for delete
  using (public.is_admin());

-- Image library: public links for pictures used in posts.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "Anyone can view media"
  on storage.objects for select
  using (bucket_id = 'media');
create policy "Admins can upload media"
  on storage.objects for insert
  with check (bucket_id = 'media' and public.is_admin());
create policy "Admins can replace media"
  on storage.objects for update
  using (bucket_id = 'media' and public.is_admin());
create policy "Admins can remove media"
  on storage.objects for delete
  using (bucket_id = 'media' and public.is_admin());

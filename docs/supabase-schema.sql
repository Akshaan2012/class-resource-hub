create extension if not exists pgcrypto;

create table if not exists public.campers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  author_id uuid references public.campers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('file', 'text', 'prompt', 'link')),
  title text not null,
  subject text not null default 'General',
  unit text not null default '',
  teacher text not null default '',
  semester text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  content text,
  url text,
  file_path text,
  file_name text,
  file_size bigint,
  mime text,
  pinned boolean not null default false,
  author_id uuid references public.campers(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  author_id uuid references public.campers(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.campers(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text not null default '',
  subject text not null default 'General',
  unit text not null default '',
  teacher text not null default '',
  semester text not null default '',
  fulfilled boolean not null default false,
  author_id uuid references public.campers(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  author_id uuid references public.campers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.bookmarks (
  camper_id uuid not null references public.campers(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (camper_id, resource_id)
);

create table if not exists public.helpful_votes (
  camper_id uuid not null references public.campers(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (camper_id, resource_id)
);

insert into public.folders (name)
values ('General')
on conflict (name) do nothing;

alter table public.campers enable row level security;
alter table public.folders enable row level security;
alter table public.resources enable row level security;
alter table public.comments enable row level security;
alter table public.chat_messages enable row level security;
alter table public.requests enable row level security;
alter table public.announcements enable row level security;
alter table public.bookmarks enable row level security;
alter table public.helpful_votes enable row level security;

create policy "camp prototype read campers" on public.campers for select using (true);
create policy "camp prototype insert campers" on public.campers for insert with check (true);

create policy "camp prototype read folders" on public.folders for select using (true);
create policy "camp prototype insert folders" on public.folders for insert with check (true);

create policy "camp prototype read resources" on public.resources for select using (true);
create policy "camp prototype insert resources" on public.resources for insert with check (true);
create policy "camp prototype update resources" on public.resources for update using (true) with check (true);
create policy "camp prototype delete resources" on public.resources for delete using (true);

create policy "camp prototype read comments" on public.comments for select using (true);
create policy "camp prototype insert comments" on public.comments for insert with check (true);
create policy "camp prototype delete comments" on public.comments for delete using (true);

create policy "camp prototype read chat" on public.chat_messages for select using (true);
create policy "camp prototype insert chat" on public.chat_messages for insert with check (true);
create policy "camp prototype delete chat" on public.chat_messages for delete using (true);

create policy "camp prototype read requests" on public.requests for select using (true);
create policy "camp prototype insert requests" on public.requests for insert with check (true);
create policy "camp prototype update requests" on public.requests for update using (true) with check (true);
create policy "camp prototype delete requests" on public.requests for delete using (true);

create policy "camp prototype read announcements" on public.announcements for select using (true);
create policy "camp prototype insert announcements" on public.announcements for insert with check (true);
create policy "camp prototype delete announcements" on public.announcements for delete using (true);

create policy "camp prototype read bookmarks" on public.bookmarks for select using (true);
create policy "camp prototype insert bookmarks" on public.bookmarks for insert with check (true);
create policy "camp prototype delete bookmarks" on public.bookmarks for delete using (true);

create policy "camp prototype read helpful votes" on public.helpful_votes for select using (true);
create policy "camp prototype insert helpful votes" on public.helpful_votes for insert with check (true);
create policy "camp prototype delete helpful votes" on public.helpful_votes for delete using (true);

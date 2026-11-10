-- v2.4 F5: shopping list.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments, recipes or favourites.
-- Show this file to Sacha before pasting.
-- The app saves the list on-device if this table is missing.

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id text not null,
  ingredient_key text not null,
  ingredient text not null,
  quantity numeric,
  unit text,
  aisle text not null default '',
  ticked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id, ingredient_key)
);

create index if not exists shopping_list_items_user_idx
  on public.shopping_list_items (user_id, aisle, created_at);

alter table public.shopping_list_items enable row level security;

drop policy if exists "Users can read their own shopping list" on public.shopping_list_items;
create policy "Users can read their own shopping list" on public.shopping_list_items
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can insert their own shopping list" on public.shopping_list_items;
create policy "Users can insert their own shopping list" on public.shopping_list_items
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own shopping list" on public.shopping_list_items;
create policy "Users can update their own shopping list" on public.shopping_list_items
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own shopping list" on public.shopping_list_items;
create policy "Users can delete their own shopping list" on public.shopping_list_items
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.shopping_list_items to authenticated;

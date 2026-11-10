-- v2.4 F2: recipes, collections, favourites, and profiles.hide_macros.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments or account data.
-- Does not seed recipes. The app uses content/food until a live content:sync.
-- Show this file to Sacha before pasting.

alter table public.profiles
  add column if not exists hide_macros boolean;

update public.profiles
set hide_macros = false
where hide_macros is null;

alter table public.profiles
  alter column hide_macros set default false;

create table if not exists public.recipes (
  id text primary key,
  slug text not null unique,
  title text not null,
  summary text not null default '',
  cover_image_id text,
  meal_type text not null,
  prep_minutes smallint not null default 0,
  cook_minutes smallint not null default 0,
  servings smallint not null default 1,
  ingredients jsonb not null default '[]'::jsonb,
  method_steps jsonb not null default '[]'::jsonb,
  nutrition_per_serving jsonb,
  allergens jsonb not null default '[]'::jsonb,
  allergen_labels jsonb not null default '[]'::jsonb,
  check_label_notes jsonb not null default '[]'::jsonb,
  dietary_tags jsonb not null default '[]'::jsonb,
  intended_claims jsonb not null default '[]'::jsonb,
  verified_claims jsonb not null default '[]'::jsonb,
  is_pro boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  published_at date,
  sort_order integer not null default 0
);

alter table public.recipes add column if not exists allergen_labels jsonb not null default '[]'::jsonb;
alter table public.recipes add column if not exists check_label_notes jsonb not null default '[]'::jsonb;
alter table public.recipes add column if not exists intended_claims jsonb not null default '[]'::jsonb;
alter table public.recipes add column if not exists verified_claims jsonb not null default '[]'::jsonb;

alter table public.recipes drop constraint if exists recipes_meal_type_check;
alter table public.recipes add constraint recipes_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'smoothie'));

create table if not exists public.recipe_collections (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  cover_image_id text,
  sort_order integer not null default 0,
  is_pro boolean not null default false,
  requires_verified_claim text
);

create table if not exists public.recipe_collection_items (
  collection_id text not null references public.recipe_collections (id) on delete cascade,
  recipe_id text not null references public.recipes (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (collection_id, recipe_id)
);

create table if not exists public.recipe_favourites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index if not exists recipe_favourites_user_idx
  on public.recipe_favourites (user_id, created_at desc);

alter table public.recipes enable row level security;
alter table public.recipe_collections enable row level security;
alter table public.recipe_collection_items enable row level security;
alter table public.recipe_favourites enable row level security;

drop policy if exists "Signed-in users can read recipes" on public.recipes;
drop policy if exists "Entitled users can read recipes" on public.recipes;
drop policy if exists "Signed-in users can read recipe collections" on public.recipe_collections;
drop policy if exists "Entitled users can read recipe collections" on public.recipe_collections;
drop policy if exists "Signed-in users can read recipe collection items" on public.recipe_collection_items;
drop policy if exists "Entitled users can read recipe collection items" on public.recipe_collection_items;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_ascenda_pro'
  ) then
    execute $p$
      create policy "Entitled users can read recipes" on public.recipes
        for select to authenticated using (public.has_ascenda_pro())
    $p$;
    execute $p$
      create policy "Entitled users can read recipe collections" on public.recipe_collections
        for select to authenticated using (public.has_ascenda_pro())
    $p$;
    execute $p$
      create policy "Entitled users can read recipe collection items" on public.recipe_collection_items
        for select to authenticated using (public.has_ascenda_pro())
    $p$;
  else
    execute $p$
      create policy "Signed-in users can read recipes" on public.recipes
        for select to authenticated using (true)
    $p$;
    execute $p$
      create policy "Signed-in users can read recipe collections" on public.recipe_collections
        for select to authenticated using (true)
    $p$;
    execute $p$
      create policy "Signed-in users can read recipe collection items" on public.recipe_collection_items
        for select to authenticated using (true)
    $p$;
  end if;
end $$;

drop policy if exists "Users can read their own recipe favourites" on public.recipe_favourites;
create policy "Users can read their own recipe favourites" on public.recipe_favourites
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can write their own recipe favourites" on public.recipe_favourites;
create policy "Users can write their own recipe favourites" on public.recipe_favourites
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own recipe favourites" on public.recipe_favourites;
create policy "Users can delete their own recipe favourites" on public.recipe_favourites
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.recipes to authenticated;
grant select on public.recipe_collections to authenticated;
grant select on public.recipe_collection_items to authenticated;
grant select, insert, delete on public.recipe_favourites to authenticated;

/**
 * Write supabase/images_manifest.sql from content/images/image-manifest.json.
 * Does not connect to Supabase. Run: node scripts/emit-images-manifest-sql.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

type Entry = {
  slug: string;
  kind?: string | null;
  shot?: string | null;
  orientation?: string | null;
  brief?: string | null;
  same_as?: string | null;
};

function sql(value: string | null | undefined): string {
  if (value == null || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const manifest = JSON.parse(
  readFileSync(join(ROOT, 'content', 'images', 'image-manifest.json'), 'utf8')
) as { images?: Entry[] };
const images = manifest.images ?? [];

const values = images
  .map((item) => {
    const alt = item.brief?.trim() || item.slug;
    return `  (${sql(item.slug)}, ${sql(item.slug)}, ${sql(item.kind)}, ${sql(item.shot)}, ${sql(item.orientation)}, ${sql(item.brief)}, ${sql(item.same_as)}, ${sql(alt)})`;
  })
  .join(',\n');

const file = `-- Image manifest columns and seed rows.
-- Paste this in the Supabase SQL editor. It does not delete rows.
-- It does not touch sessions, sets, enrolments or profiles.
-- On conflict it updates the brief and the other descriptive fields only.
-- status, url, storage_path, photographer, source_url, licence_source and model_release are left as they are,
-- so a photo you have already marked ready stays ready.
-- Generated from content/images/image-manifest.json (${images.length} slugs).

alter table public.images add column if not exists slug text;
alter table public.images add column if not exists kind text;
alter table public.images add column if not exists shot text;
alter table public.images add column if not exists orientation text;
alter table public.images add column if not exists brief text;
alter table public.images add column if not exists same_as text;
alter table public.images add column if not exists status text not null default 'needed';
alter table public.images add column if not exists photographer text;
alter table public.images add column if not exists source_url text;
alter table public.images add column if not exists model_release text;

update public.images set slug = id where slug is null;

alter table public.images alter column slug set not null;

alter table public.images drop constraint if exists images_status_check;
alter table public.images add constraint images_status_check check (status in ('needed', 'ready'));

alter table public.images drop constraint if exists images_kind_check;
alter table public.images add constraint images_kind_check check (kind is null or kind in ('people', 'equipment', 'food'));

create unique index if not exists images_slug_key on public.images (slug);

insert into public.images (id, slug, kind, shot, orientation, brief, same_as, alt_text)
values
${values}
on conflict (id) do update set
  slug = excluded.slug,
  kind = excluded.kind,
  shot = excluded.shot,
  orientation = excluded.orientation,
  brief = excluded.brief,
  same_as = excluded.same_as,
  alt_text = excluded.alt_text;
`;

writeFileSync(join(ROOT, 'supabase', 'images_manifest.sql'), file);
console.log(`Wrote supabase/images_manifest.sql (${images.length} slugs). Not executed.`);

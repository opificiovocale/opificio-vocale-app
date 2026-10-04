-- Audio condivisi del Reset: applicare dopo schema.sql.
-- I file restano privati; ogni allievo accede solo ai giorni sbloccati.
create table public.reset_audio (
  day smallint primary key check (day between 1 and 7),
  title text not null check (length(btrim(title)) between 1 and 160),
  storage_path text not null unique check (
    storage_path ~ '^giorno-[1-7]/[0-9a-f-]{36}\.mp3$'
    and split_part(storage_path, '/', 1) = 'giorno-' || day::text
  ),
  file_name text not null check (length(file_name) between 1 and 240),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reset_audio enable row level security;
revoke all on public.reset_audio from public, anon;
grant select, insert, update, delete on public.reset_audio to authenticated;

create function private.reset_unlocked_day()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select greatest(0, least(7,
      (now() at time zone 'Europe/Rome')::date
      - coalesce(p.data_inizio, (p.created_at at time zone 'Europe/Rome')::date) + 1
    ))
    from public.packages p
    where (select auth.uid()) is not null
      and p.student_id = (select private.current_student_id())
      and lower(btrim(p.nome_percorso)) = 'reset vocale'
      and p.stato in ('attivo', 'completato')
    order by (p.stato = 'attivo') desc, p.created_at desc, p.id desc
    limit 1
  ), 0);
$$;
revoke all on function private.reset_unlocked_day() from public, anon;
grant execute on function private.reset_unlocked_day() to authenticated;

create policy reset_audio_select
on public.reset_audio for select to authenticated
using ((select private.is_admin()) or day <= (select private.reset_unlocked_day()));

create policy reset_audio_admin_insert
on public.reset_audio for insert to authenticated
with check ((select private.is_admin()));

create policy reset_audio_admin_update
on public.reset_audio for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy reset_audio_admin_delete
on public.reset_audio for delete to authenticated
using ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reset-vocale', 'reset-vocale', false, 26214400, array['audio/mpeg']);

create policy reset_audio_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'reset-vocale'
  and ((select private.is_admin()) or exists (
    select 1 from public.reset_audio a
    where a.storage_path = storage.objects.name
      and a.day <= (select private.reset_unlocked_day())
  ))
);

create policy reset_audio_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'reset-vocale'
  and name ~ '^giorno-[1-7]/[0-9a-f-]{36}\.mp3$'
  and (select private.is_admin())
);

create policy reset_audio_storage_update
on storage.objects for update to authenticated
using (bucket_id = 'reset-vocale' and (select private.is_admin()))
with check (
  bucket_id = 'reset-vocale'
  and name ~ '^giorno-[1-7]/[0-9a-f-]{36}\.mp3$'
  and (select private.is_admin())
);

create policy reset_audio_storage_delete
on storage.objects for delete to authenticated
using (bucket_id = 'reset-vocale' and (select private.is_admin()));

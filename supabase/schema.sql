-- Opificio Vocale · Studio V1
-- Schema sicuro per Supabase/Postgres.
-- Le note private sono fisicamente separate dai record leggibili dagli allievi.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cognome text not null default '',
  email text not null,
  telefono text,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists students_email_unique
  on public.students (lower(email));

create table if not exists public.student_private_notes (
  student_id uuid primary key references public.students(id) on delete cascade,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'student' check (role in ('admin', 'student')),
  student_id uuid unique references public.students(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  nome_percorso text not null,
  incontri_totali integer not null check (incontri_totali > 0),
  incontri_usati integer not null default 0 check (incontri_usati >= 0),
  data_inizio date,
  stato text not null default 'attivo' check (stato in ('attivo', 'completato', 'sospeso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (incontri_usati <= incontri_totali)
);

create index if not exists packages_student_id_idx on public.packages(student_id);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  package_id uuid references public.packages(id) on delete set null,
  data_ora timestamptz not null,
  durata_minuti integer not null default 60 check (durata_minuti > 0 and durata_minuti <= 240),
  stato text not null default 'presente'
    check (stato in ('presente', 'assente', 'recupero', 'annullata')),
  focus text,
  riepilogo_allievo text,
  esercizi text,
  recording_url text,
  transcript_url text,
  materials_url text,
  visible_to_student boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lessons_student_id_idx on public.lessons(student_id);
create index if not exists lessons_package_id_idx on public.lessons(package_id);
create index if not exists lessons_data_ora_idx on public.lessons(data_ora desc);

create table if not exists public.lesson_private_notes (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  note text,
  updated_at timestamptz not null default now()
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, ''), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function private.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select student_id
  from public.profiles
  where id = (select auth.uid());
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.current_student_id() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_student_id() to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_private_notes enable row level security;
alter table public.packages enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_private_notes enable row level security;

create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy "profiles_admin_insert"
on public.profiles for insert
to authenticated
with check ((select private.is_admin()));

create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "profiles_admin_delete"
on public.profiles for delete
to authenticated
using ((select private.is_admin()));

create policy "students_select_own_or_admin"
on public.students for select
to authenticated
using (id = (select private.current_student_id()) or (select private.is_admin()));

create policy "students_admin_insert"
on public.students for insert
to authenticated
with check ((select private.is_admin()));

create policy "students_admin_update"
on public.students for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "students_admin_delete"
on public.students for delete
to authenticated
using ((select private.is_admin()));

create policy "student_private_notes_admin_select"
on public.student_private_notes for select
to authenticated
using ((select private.is_admin()));

create policy "student_private_notes_admin_insert"
on public.student_private_notes for insert
to authenticated
with check ((select private.is_admin()));

create policy "student_private_notes_admin_update"
on public.student_private_notes for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "student_private_notes_admin_delete"
on public.student_private_notes for delete
to authenticated
using ((select private.is_admin()));

create policy "packages_select_own_or_admin"
on public.packages for select
to authenticated
using (student_id = (select private.current_student_id()) or (select private.is_admin()));

create policy "packages_admin_insert"
on public.packages for insert
to authenticated
with check ((select private.is_admin()));

create policy "packages_admin_update"
on public.packages for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "packages_admin_delete"
on public.packages for delete
to authenticated
using ((select private.is_admin()));

create policy "lessons_select_visible_own_or_admin"
on public.lessons for select
to authenticated
using (
  (select private.is_admin())
  or (
    student_id = (select private.current_student_id())
    and visible_to_student = true
  )
);

create policy "lessons_admin_insert"
on public.lessons for insert
to authenticated
with check ((select private.is_admin()));

create policy "lessons_admin_update"
on public.lessons for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "lessons_admin_delete"
on public.lessons for delete
to authenticated
using ((select private.is_admin()));

create policy "lesson_private_notes_admin_select"
on public.lesson_private_notes for select
to authenticated
using ((select private.is_admin()));

create policy "lesson_private_notes_admin_insert"
on public.lesson_private_notes for insert
to authenticated
with check ((select private.is_admin()));

create policy "lesson_private_notes_admin_update"
on public.lesson_private_notes for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "lesson_private_notes_admin_delete"
on public.lesson_private_notes for delete
to authenticated
using ((select private.is_admin()));

revoke all on public.profiles, public.students, public.student_private_notes, public.packages, public.lessons, public.lesson_private_notes from anon;
grant select, insert, update, delete on public.profiles, public.students, public.student_private_notes, public.packages, public.lessons, public.lesson_private_notes to authenticated;


-- Auth bootstrap e collegamento automatico profilo ↔ allievo.
create table if not exists private.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);
revoke all on table private.admin_allowlist from public, anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  matched_student_id uuid;
  assigned_role text := 'student';
begin
  if exists (
    select 1 from private.admin_allowlist
    where lower(email) = lower(coalesce(new.email, ''))
  ) then
    assigned_role := 'admin';
  else
    select id into matched_student_id
    from public.students
    where lower(email) = lower(coalesce(new.email, ''))
    limit 1;
  end if;

  insert into public.profiles (id, email, role, student_id)
  values (new.id, coalesce(new.email, ''), assigned_role, matched_student_id)
  on conflict (id) do update
    set email = excluded.email,
        role = case when public.profiles.role = 'admin' then 'admin' else excluded.role end,
        student_id = coalesce(public.profiles.student_id, excluded.student_id),
        updated_at = now();
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create or replace function private.link_profile_to_student()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
  set student_id = new.id, updated_at = now()
  where role = 'student'
    and lower(email) = lower(new.email)
    and (student_id is null or student_id = new.id);
  return new;
end;
$$;
revoke all on function private.link_profile_to_student() from public, anon, authenticated;

drop trigger if exists on_student_email_link_profile on public.students;
create trigger on_student_email_link_profile
  after insert or update of email on public.students
  for each row execute function private.link_profile_to_student();

alter table public.packages
  drop constraint if exists packages_id_student_unique;
alter table public.packages
  add constraint packages_id_student_unique unique (id, student_id);

alter table public.lessons
  drop constraint if exists lessons_package_student_fkey;
alter table public.lessons
  add constraint lessons_package_student_fkey
  foreign key (package_id, student_id)
  references public.packages(id, student_id)
  on delete restrict;

create index if not exists lessons_package_student_idx
  on public.lessons(package_id, student_id);

create or replace function public.create_studio_lesson(
  p_student_id uuid,
  p_package_id uuid,
  p_data_ora timestamptz,
  p_durata_minuti integer,
  p_stato text,
  p_focus text,
  p_note_private text,
  p_riepilogo_allievo text,
  p_esercizi text,
  p_recording_url text,
  p_transcript_url text,
  p_materials_url text,
  p_visible_to_student boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_lesson_id uuid;
begin
  if p_package_id is not null and not exists (
    select 1 from public.packages
    where id = p_package_id and student_id = p_student_id
  ) then
    raise exception 'Il percorso selezionato non appartiene a questo allievo.';
  end if;

  insert into public.lessons (
    student_id, package_id, data_ora, durata_minuti, stato, focus,
    riepilogo_allievo, esercizi, recording_url, transcript_url,
    materials_url, visible_to_student
  ) values (
    p_student_id, p_package_id, p_data_ora, p_durata_minuti, p_stato, p_focus,
    p_riepilogo_allievo, p_esercizi, p_recording_url, p_transcript_url,
    p_materials_url, p_visible_to_student
  )
  returning id into new_lesson_id;

  if nullif(trim(coalesce(p_note_private, '')), '') is not null then
    insert into public.lesson_private_notes (lesson_id, note)
    values (new_lesson_id, trim(p_note_private));
  end if;

  if p_package_id is not null and p_stato in ('presente', 'recupero') then
    update public.packages
    set incontri_usati = least(incontri_usati + 1, incontri_totali),
        stato = case
          when least(incontri_usati + 1, incontri_totali) >= incontri_totali then 'completato'
          else stato
        end,
        updated_at = now()
    where id = p_package_id and student_id = p_student_id;
  end if;

  return new_lesson_id;
end;
$$;

revoke all on function public.create_studio_lesson(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.create_studio_lesson(
  uuid, uuid, timestamptz, integer, text, text, text, text, text, text, text, text, boolean
) to authenticated;

create or replace function public.update_studio_lesson(
  p_lesson_id uuid,
  p_data_ora timestamptz,
  p_durata_minuti integer,
  p_stato text,
  p_focus text,
  p_note_private text,
  p_riepilogo_allievo text,
  p_esercizi text,
  p_recording_url text,
  p_transcript_url text,
  p_materials_url text,
  p_visible_to_student boolean
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old public.lessons%rowtype;
  v_old_counted boolean;
  v_new_counted boolean;
begin
  select * into v_old
  from public.lessons
  where id = p_lesson_id
  for update;

  if not found then raise exception 'Lezione non trovata.'; end if;

  v_old_counted := v_old.stato in ('presente', 'recupero');
  v_new_counted := p_stato in ('presente', 'recupero');

  update public.lessons
  set data_ora = p_data_ora,
      durata_minuti = p_durata_minuti,
      stato = p_stato,
      focus = p_focus,
      riepilogo_allievo = p_riepilogo_allievo,
      esercizi = p_esercizi,
      recording_url = p_recording_url,
      transcript_url = p_transcript_url,
      materials_url = p_materials_url,
      visible_to_student = p_visible_to_student,
      updated_at = now()
  where id = p_lesson_id;

  if nullif(trim(coalesce(p_note_private, '')), '') is null then
    delete from public.lesson_private_notes where lesson_id = p_lesson_id;
  else
    insert into public.lesson_private_notes (lesson_id, note, updated_at)
    values (p_lesson_id, trim(p_note_private), now())
    on conflict (lesson_id)
    do update set note = excluded.note, updated_at = excluded.updated_at;
  end if;

  if v_old.package_id is not null and v_old_counted is distinct from v_new_counted then
    if v_new_counted then
      update public.packages
      set incontri_usati = least(incontri_usati + 1, incontri_totali),
          stato = case
            when least(incontri_usati + 1, incontri_totali) >= incontri_totali then 'completato'
            else stato
          end,
          updated_at = now()
      where id = v_old.package_id and student_id = v_old.student_id;
    else
      update public.packages
      set incontri_usati = greatest(incontri_usati - 1, 0),
          stato = case
            when stato = 'completato' and greatest(incontri_usati - 1, 0) < incontri_totali then 'attivo'
            else stato
          end,
          updated_at = now()
      where id = v_old.package_id and student_id = v_old.student_id;
    end if;
  end if;
end;
$$;

revoke all on function public.update_studio_lesson(
  uuid, timestamptz, integer, text, text, text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.update_studio_lesson(
  uuid, timestamptz, integer, text, text, text, text, text, text, text, text, boolean
) to authenticated;

create or replace function public.delete_studio_lesson(p_lesson_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_lesson public.lessons%rowtype;
begin
  select * into v_lesson
  from public.lessons
  where id = p_lesson_id
  for update;

  if not found then raise exception 'Lezione non trovata.'; end if;

  delete from public.lessons where id = p_lesson_id;

  if v_lesson.package_id is not null and v_lesson.stato in ('presente', 'recupero') then
    update public.packages
    set incontri_usati = greatest(incontri_usati - 1, 0),
        stato = case
          when stato = 'completato' and greatest(incontri_usati - 1, 0) < incontri_totali then 'attivo'
          else stato
        end,
        updated_at = now()
    where id = v_lesson.package_id and student_id = v_lesson.student_id;
  end if;
end;
$$;

revoke all on function public.delete_studio_lesson(uuid) from public, anon;
grant execute on function public.delete_studio_lesson(uuid) to authenticated;

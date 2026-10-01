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

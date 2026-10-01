-- Opificio Vocale · Studio V1
-- Schema iniziale per Supabase/Postgres.
-- Eseguire nel SQL editor del progetto Supabase.

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cognome text not null default '',
  email text not null,
  telefono text,
  attivo boolean not null default true,
  note_generali_private text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists students_email_unique
  on public.students (lower(email));

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
  note_private text,
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
create index if not exists lessons_data_ora_idx on public.lessons(data_ora desc);

-- Profilo automatico dopo il primo accesso via magic link.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, ''), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper per le policy. SECURITY DEFINER evita ricorsione RLS su profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select student_id from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.packages enable row level security;
alter table public.lessons enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write"
on public.profiles for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "students_select_own_or_admin" on public.students;
create policy "students_select_own_or_admin"
on public.students for select
using (id = public.current_student_id() or public.is_admin());

drop policy if exists "students_admin_write" on public.students;
create policy "students_admin_write"
on public.students for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "packages_select_own_or_admin" on public.packages;
create policy "packages_select_own_or_admin"
on public.packages for select
using (student_id = public.current_student_id() or public.is_admin());

drop policy if exists "packages_admin_write" on public.packages;
create policy "packages_admin_write"
on public.packages for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "lessons_select_visible_own_or_admin" on public.lessons;
create policy "lessons_select_visible_own_or_admin"
on public.lessons for select
using (
  public.is_admin()
  or (
    student_id = public.current_student_id()
    and visible_to_student = true
  )
);

drop policy if exists "lessons_admin_write" on public.lessons;
create policy "lessons_admin_write"
on public.lessons for all
using (public.is_admin())
with check (public.is_admin());

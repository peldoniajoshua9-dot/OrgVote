-- Run this whole file once in Supabase: SQL Editor > New query > Run
-- Fresh setup: clears old OrgVote tables (only safe before real data exists)
drop table if exists votes, candidates, students, whitelist cascade;

create extension if not exists pgcrypto with schema extensions;

create table if not exists whitelist(lrn text primary key check (lrn ~ '^[0-9]{12}$'));
create table if not exists students(lrn text primary key references whitelist(lrn) on delete cascade, pw_hash text not null);
create table if not exists candidates(id uuid primary key default gen_random_uuid(), name text not null, office text not null);
create table if not exists votes(lrn text primary key references students(lrn) on delete cascade, candidate_id uuid not null references candidates(id));

-- RLS on with NO policies: the public key cannot read or write tables directly.
alter table whitelist enable row level security;
alter table students enable row level security;
alter table candidates enable row level security;
alter table votes enable row level security;

-- Admin check (hash of the Unique Admin ID)
create or replace function is_admin(p text) returns boolean
language sql security definer set search_path = public, extensions as $fn$
  select encode(digest(coalesce(p,''),'sha256'),'hex') = '283b40616ccd07df6bc188351075aabee654c771e99691adb95827741839ff30'
$fn$;
revoke all on function is_admin(text) from public, anon, authenticated;

-- Student functions
create or replace function student_register(p_lrn text, p_pw text) returns text
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not exists (select 1 from whitelist where lrn = p_lrn) then return 'NOT_ENROLLED'; end if;
  if exists (select 1 from students where lrn = p_lrn) then return 'EXISTS'; end if;
  if length(coalesce(p_pw,'')) < 6 then return 'WEAK'; end if;
  insert into students values (p_lrn, crypt(p_pw, gen_salt('bf')));
  return 'OK';
end $fn$;

create or replace function student_login(p_lrn text, p_pw text) returns boolean
language sql security definer set search_path = public, extensions as $fn$
  select exists (select 1 from students where lrn = p_lrn and pw_hash = crypt(p_pw, pw_hash))
$fn$;

create or replace function list_candidates() returns table(id uuid, name text, office text)
language sql security definer set search_path = public as $fn$
  select id, name, office from candidates order by name
$fn$;

create or replace function my_vote(p_lrn text, p_pw text) returns uuid
language sql security definer set search_path = public, extensions as $fn$
  select v.candidate_id from votes v where v.lrn = p_lrn and student_login(p_lrn, p_pw)
$fn$;

create or replace function cast_vote(p_lrn text, p_pw text, p_candidate uuid) returns text
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not student_login(p_lrn, p_pw) then return 'BAD_LOGIN'; end if;
  if exists (select 1 from votes where lrn = p_lrn) then return 'ALREADY'; end if;
  if not exists (select 1 from candidates where id = p_candidate) then return 'BAD_CANDIDATE'; end if;
  insert into votes values (p_lrn, p_candidate);
  return 'OK';
end $fn$;

-- Admin functions (each checks the Admin ID)
create or replace function admin_state(p_admin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not is_admin(p_admin) then raise exception 'unauthorized'; end if;
  return jsonb_build_object(
    'whitelist', coalesce((select jsonb_agg(lrn order by lrn) from whitelist), '[]'::jsonb),
    'registered', (select count(*) from students),
    'total_votes', (select count(*) from votes),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'position', c.office,
        'votes', (select count(*) from votes v where v.candidate_id = c.id)) order by c.name) from candidates c), '[]'::jsonb));
end $fn$;

create or replace function admin_add_lrn(p_admin text, p_lrn text) returns void
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not is_admin(p_admin) then raise exception 'unauthorized'; end if;
  insert into whitelist values (p_lrn) on conflict do nothing;
end $fn$;

create or replace function admin_remove_lrn(p_admin text, p_lrn text) returns text
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not is_admin(p_admin) then raise exception 'unauthorized'; end if;
  if exists (select 1 from votes where lrn = p_lrn) then return 'VOTED'; end if;
  delete from whitelist where lrn = p_lrn;
  return 'OK';
end $fn$;

create or replace function admin_add_candidate(p_admin text, p_name text, p_pos text) returns void
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not is_admin(p_admin) then raise exception 'unauthorized'; end if;
  insert into candidates(name, office) values (p_name, p_pos);
end $fn$;

create or replace function admin_remove_candidate(p_admin text, p_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not is_admin(p_admin) then raise exception 'unauthorized'; end if;
  if exists (select 1 from votes) then return 'VOTING_STARTED'; end if;
  delete from candidates where id = p_id;
  return 'OK';
end $fn$;

-- Let the public key call only the intended functions
grant execute on function student_register(text,text), student_login(text,text), list_candidates(),
  my_vote(text,text), cast_vote(text,text,uuid), admin_state(text), admin_add_lrn(text,text),
  admin_remove_lrn(text,text), admin_add_candidate(text,text,text), admin_remove_candidate(text,uuid)
  to anon, authenticated;

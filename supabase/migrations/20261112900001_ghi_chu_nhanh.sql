-- Ghi chú nhanh trong mục Soạn thảo.
-- Mỗi người chỉ thấy và sửa ghi chú của chính mình (kể cả quản trị cũng không xem được).

create table public.quick_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quick_notes_owner_idx on public.quick_notes (owner_id, pinned desc, updated_at desc);

create function private.quick_notes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
create trigger quick_notes_touch before update on public.quick_notes
  for each row execute function private.quick_notes_touch();

alter table public.quick_notes enable row level security;
revoke all on public.quick_notes from anon, authenticated;
grant select, insert, update, delete on public.quick_notes to authenticated;

create policy quick_notes_owner on public.quick_notes for all to authenticated
  using (owner_id = auth.uid() and private.is_active_user())
  with check (owner_id = auth.uid() and private.is_active_user());

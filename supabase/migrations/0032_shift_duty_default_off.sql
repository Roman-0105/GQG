-- ============================================================================
-- 0032: статус вахты по умолчанию — «не на вахте» (07.10.2026).
-- Все мастера (роль party_chief) переводятся на межвахту; на вахту мастер
-- заступает сам кнопкой «Заступить на вахту» (или принимая смену от
-- коллеги). Список сменщиков теперь отдаёт ещё и должность. Статус вахты —
-- информационный, права доступа он не меняет. Идемпотентна.
-- ============================================================================

alter table profiles alter column on_duty set default false;
update profiles set on_duty = false where role = 'party_chief';

drop function if exists list_shift_candidates();
create or replace function list_shift_candidates()
returns table (id uuid, full_name text, position_name text, on_duty boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, pos.name, p.on_duty
  from profiles p
  left join positions pos on pos.id = p.position_id
  where p.role = 'party_chief' and p.id <> auth.uid()
    and (is_management() or exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'party_chief'))
  order by p.full_name;
$$;

grant execute on function list_shift_candidates() to authenticated;

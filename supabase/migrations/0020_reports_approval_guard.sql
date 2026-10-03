-- ============================================================================
-- 0020: защита процесса согласования сводок на уровне БД (30.09.2026).
--
-- Проблема (найдена при аудите): RLS-политика reports_update_own_when_editable
-- проверяет только author_id, поэтому автор (party_chief) мог напрямую через
-- API выставить СВОЕЙ сводке approval_status = 'approved' (или 'rejected'),
-- проставить approved_by/approved_at или сам снять блокировку edit_unlocked.
-- То же при INSERT: можно вставить сразу 'approved'.
--
-- Решение: триггер BEFORE INSERT OR UPDATE на reports. Для management
-- (гендир/техдир/разработчик) ничего не меняется. Для остальных:
--   * INSERT только как draft, без approved_by/approved_at, без edit_unlocked;
--   * UPDATE: нельзя переводить в approved/rejected, нельзя менять
--     approved_by/approved_at, нельзя САМОМУ включить edit_unlocked,
--     нельзя записать review_comment (комментарий проверяющего), разрешено
--     только очистить его при повторной отправке.
-- Допустимые переходы автора: draft→draft/submitted, а также правка и
-- повторная отправка разблокированной (edit_unlocked) сводки.
-- Идемпотентна: можно запускать повторно.
-- ============================================================================

create or replace function reports_guard_approval()
returns trigger
language plpgsql
as $$
begin
  -- management: полный контроль над согласованием, как и раньше.
  -- Запросы из SQL Editor идут без auth.uid() — тоже пропускаем.
  if auth.uid() is null or is_management() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.approval_status <> 'draft'
       or new.approved_by is not null
       or new.approved_at is not null
       or new.edit_unlocked
       or new.review_comment is not null then
      raise exception 'Новая сводка может быть создана только как черновик'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.approval_status in ('approved', 'rejected')
     and new.approval_status is distinct from old.approval_status then
    raise exception 'Статус "%" может выставлять только руководство', new.approval_status
      using errcode = '42501';
  end if;

  if new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then
    raise exception 'Поля согласования может менять только руководство'
      using errcode = '42501';
  end if;

  if new.edit_unlocked and not old.edit_unlocked then
    raise exception 'Разблокировать правку может только руководство'
      using errcode = '42501';
  end if;

  if new.review_comment is not null
     and new.review_comment is distinct from old.review_comment then
    raise exception 'Комментарий проверяющего может менять только руководство'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists reports_guard_approval_trg on reports;
create trigger reports_guard_approval_trg
  before insert or update on reports
  for each row execute function reports_guard_approval();

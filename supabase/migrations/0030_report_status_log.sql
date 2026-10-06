-- ============================================================================
-- 0030: история согласования сводок (06.10.2026).
-- Журнал report_status_log: кто и когда отправил, согласовал, отклонил или
-- вернул сводку мастеру на правку (и с каким комментарием). Пишется
-- триггером на reports (security definer), с клиента писать в журнал нельзя.
-- Читать может тот, кто видит саму сводку. «Вернуть на правку» = статус
-- rejected + edit_unlocked, это делает руководство обновлением reports.
-- Идемпотентна.
-- ============================================================================

create table if not exists report_status_log (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  action text not null check (action in ('submitted', 'resubmitted', 'approved', 'rejected', 'returned')),
  actor_id uuid references profiles(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists report_status_log_report_idx on report_status_log(report_id, created_at);

alter table report_status_log enable row level security;

drop policy if exists "report_status_log_select" on report_status_log;
create policy "report_status_log_select"
  on report_status_log for select
  using (exists (select 1 from reports r where r.id = report_status_log.report_id));

create or replace function log_report_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act text;
begin
  if tg_op = 'UPDATE' and new.approval_status is not distinct from old.approval_status then
    return new;
  end if;
  if new.approval_status = 'draft' then
    return new;
  end if;

  if new.approval_status = 'submitted' then
    if exists (
      select 1 from report_status_log l
      where l.report_id = new.id and l.action in ('rejected', 'returned')
    ) then
      act := 'resubmitted';
    else
      act := 'submitted';
    end if;
  elsif new.approval_status = 'approved' then
    act := 'approved';
  elsif new.approval_status = 'rejected' then
    if tg_op = 'UPDATE' and old.approval_status = 'approved' then
      act := 'returned';
    else
      act := 'rejected';
    end if;
  else
    return new;
  end if;

  insert into report_status_log (report_id, action, actor_id, comment)
  values (
    new.id,
    act,
    auth.uid(),
    case when act in ('approved', 'rejected', 'returned') then new.review_comment else null end
  );
  return new;
end;
$$;

drop trigger if exists reports_log_status_trg on reports;
create trigger reports_log_status_trg
  after insert or update on reports
  for each row execute function log_report_status();

-- Задним числом: уже существующие сводки получают отправку и решение из
-- submitted_at / approved_at (один раз, пока журнал по сводке пуст).
insert into report_status_log (report_id, action, actor_id, comment, created_at)
select r.id, 'submitted', r.author_id, null, r.submitted_at
from reports r
where r.submitted_at is not null
  and r.approval_status <> 'draft'
  and not exists (select 1 from report_status_log l where l.report_id = r.id);

insert into report_status_log (report_id, action, actor_id, comment, created_at)
select r.id,
       case r.approval_status when 'approved' then 'approved' else 'rejected' end,
       r.approved_by, r.review_comment, r.approved_at
from reports r
where r.approved_at is not null
  and r.approval_status in ('approved', 'rejected')
  and not exists (
    select 1 from report_status_log l
    where l.report_id = r.id and l.action in ('approved', 'rejected', 'returned')
  );

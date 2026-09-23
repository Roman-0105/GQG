-- ============================================================================
-- Этап 12: роль "разработчик" (22.09.2026, по запросу заказчика/владельца
-- платформы). Владелец хочет быть НЕ гендиром, а отдельной, более
-- привилегированной ролью — "серый кардинал": полная власть над
-- платформой (всё, что может гендир/техдир, и сверх того — правка
-- структуры оргсхемы), но при этом СВОЙ профиль должен быть НЕВИДИМ для
-- гендира/техдира — ни в списке "Пользователи", ни где-либо ещё.
--
-- Технически: is_management() теперь возвращает true и для 'developer' —
-- так разработчик автоматически наследует ВСЕ существующие проверки
-- is_management() по всему проекту (участки, задания, согласование,
-- справочники и т.п.), без правки уже написанных политик. Отдельная
-- is_developer() — только для того, что доступно ИСКЛЮЧИТЕЛЬНО
-- разработчику сверх обычного management (сейчас это ничего не блокирует
-- само по себе — используется в первую очередь для скрытия профиля).
--
-- Невидимость — НЕ сокрытие кнопки в UI, а RLS: gendir/techdir физически
-- не получат строку profiles с role='developer' в ответе на запрос, и не
-- смогут её ни создать, ни изменить (только сам разработчик может писать
-- в profiles с role='developer').
-- ============================================================================

-- Если Supabase ругнётся на использование нового значения enum в той же
-- транзакции (старые версии Postgres до 12) — выполните эту строку
-- ОТДЕЛЬНЫМ запуском (Run), а всё остальное ниже — вторым запуском.
alter type user_role add value 'developer';

create or replace function is_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_role() = 'developer';
$$;

create or replace function is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_role() in ('general_director', 'technical_director', 'developer');
$$;

-- Гендир/техдир видят все профили, КРОМЕ role='developer'. Разработчик
-- видит всех (включая себя). Каждый видит свой собственный профиль в
-- любом случае — это не отбирали.
drop policy if exists "profiles_select_own_or_management" on profiles;
create policy "profiles_select_own_or_management"
  on profiles for select
  using (
    id = auth.uid()
    or is_developer()
    or (is_management() and role <> 'developer')
  );

-- Создавать/менять профиль с role='developer' может только сам
-- разработчик — иначе гендир технически (в обход UI, напрямую через API)
-- мог бы себе или кому-то ещё присвоить эту роль, а обновление
-- ЧУЖОГО профиля разработчика управленцем было бы "слепым" (не видя
-- строку через SELECT, USING на UPDATE у update-политики раньше не
-- проверялся отдельно — дыра).
drop policy if exists "profiles_insert_management" on profiles;
create policy "profiles_insert_management"
  on profiles for insert
  with check (is_management() and (role <> 'developer' or is_developer()));

drop policy if exists "profiles_update_management" on profiles;
create policy "profiles_update_management"
  on profiles for update
  using (is_management() and (role <> 'developer' or is_developer()))
  with check (is_management() and (role <> 'developer' or is_developer()));

-- ============================================================================
-- 0024: контур участка на карте (03.10.2026).
-- sites.boundary — полигон участка в WGS-84: JSON-массив вершин
-- [[широта, долгота], ...] (минимум 3 точки). Рисуется и редактируется
-- руководством на экране «Карта». Права: update на sites уже разрешён
-- management (политика sites_update_management).
-- Идемпотентна.
-- ============================================================================

alter table sites add column if not exists boundary jsonb;

alter table sites drop constraint if exists sites_boundary_is_array;
alter table sites
  add constraint sites_boundary_is_array
  check (boundary is null or (jsonb_typeof(boundary) = 'array' and jsonb_array_length(boundary) >= 3));

comment on column sites.boundary is
  'Контур участка: [[lat, lon], ...] в WGS-84, минимум 3 вершины. null — контур не задан.';

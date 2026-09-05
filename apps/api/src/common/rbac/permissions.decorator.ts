import { SetMetadata } from '@nestjs/common';

export type Resource =
  | 'site'
  | 'crew'
  | 'employee'
  | 'timesheet'
  | 'payroll'
  | 'rate_rule'
  | 'role'
  | 'analytics';

export type Action = 'create' | 'read' | 'update' | 'approve' | 'lock' | 'delete' | 'export';

export const PERMISSIONS_KEY = 'kern:required-permission';

/**
 * Вешается на контроллер/метод: @RequirePermission('site', 'create').
 * RbacGuard проверяет, есть ли у пользователя роль с такой парой
 * (ресурс, действие) в любой области видимости, а дальше сервис сам
 * сужает выборку данных под конкретный scope пользователя
 * (own_crew / own_sites / company) — см. RbacGuard и docs/project-plan.md, раздел 2.
 */
export const RequirePermission = (resource: Resource, action: Action) =>
  SetMetadata(PERMISSIONS_KEY, { resource, action });

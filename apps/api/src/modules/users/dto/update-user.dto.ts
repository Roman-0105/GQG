import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  // Сброс ЧУЖОГО забытого пароля тем, у кого есть user:update (Owner/HR)
  // — до сегодняшнего дня в продукте не было вообще никакого способа
  // сменить пароль, включая демо-пароль из сида (найдено devops и
  // docs-writer независимо при подготовке Этапа 06). Самостоятельная
  // смена своего пароля (когда текущий известен) — отдельный эндпоинт
  // POST /auth/change-password, не через этот DTO.
  @IsOptional()
  @MinLength(8)
  password?: string;

  // Смена роли проходит через ту же проверку эскалации привилегий,
  // что и при создании логина (UsersService.assertCanGrantRole).
  @IsOptional()
  @IsString()
  roleId?: string;

  // Учитывается только вместе с roleId (siteIds без смены роли —
  // потребовало бы отдельного эндпоинта для правки уже существующего
  // RoleAssignment; сейчас единственный способ поменять siteIds —
  // переназначить роль). Обязателен для own_sites-ролей — без него
  // такая роль не видит ни одного участка.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  siteIds?: string[];

  // Отключение доступа без удаления истории (кто вносил/согласовывал
  // табели) — токен уже выданный этому пользователю перестанет
  // работать при следующей проверке (см. JwtStrategy.validate).
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

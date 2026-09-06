import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  // Смена роли проходит через ту же проверку эскалации привилегий,
  // что и при создании логина (UsersService.assertCanGrantRole).
  @IsOptional()
  @IsString()
  roleId?: string;

  // Отключение доступа без удаления истории (кто вносил/согласовывал
  // табели) — токен уже выданный этому пользователю перестанет
  // работать при следующей проверке (см. JwtStrategy.validate).
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

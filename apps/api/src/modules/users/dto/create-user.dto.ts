import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @MinLength(8)
  password!: string;

  // Роль назначается сразу при создании логина — без роли пользователь
  // не сможет ничего делать в системе (см. docs/project-plan.md, раздел 2).
  @IsString()
  roleId!: string;

  // Обязателен, если у назначаемой роли есть хоть одно право со scope
  // own_sites — без этого списка такая роль не видит ни одного участка
  // (fail-closed по конструкции, см. RoleAssignment.siteIds в схеме).
  // Для company/own_crew — не нужен, игнорируется.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  siteIds?: string[];
}

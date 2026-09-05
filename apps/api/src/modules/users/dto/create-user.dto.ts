import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

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
}

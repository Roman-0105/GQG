import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 5 попыток в минуту с одного IP — без этого ничто не мешало
  // подбирать пароль напрямую через API (найдено security-review).
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // Свой профиль + права — без RbacGuard (см. AuthService.getMe).
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.id);
  }

  // Не за RbacGuard — смена СОБСТВЕННОГО пароля не завязана на права
  // на ресурс 'user', иначе, например, Бригадир (нет user:update) не
  // смог бы сменить даже свой пароль. Та же троттлинг-защита, что и на
  // логине — подбор currentPassword здесь эквивалентен подбору пароля.
  @Post('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changeOwnPassword(user.id, dto.currentPassword, dto.newPassword);
  }
}

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RbacGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermission('user', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }

  @Get()
  @RequirePermission('user', 'read')
  findAll(@CurrentKernUser() user: KernUser) {
    return this.usersService.findAll(user);
  }

  @Patch(':id')
  @RequirePermission('user', 'update')
  update(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user, id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SetShiftAssignmentsDto } from './dto/set-shift-assignments.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RbacGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Post()
  @RequirePermission('task', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreateTaskDto) {
    return this.service.create(user, dto);
  }

  @Get()
  @RequirePermission('task', 'read')
  findBySite(@CurrentKernUser() user: KernUser, @Query('siteId') siteId: string) {
    return this.service.findBySite(user, siteId);
  }

  // Без @RequirePermission — как /crews/mine: бригадир не имеет
  // общего task:read, но обязан видеть поставленные ему задания.
  @Get('mine')
  findMine(@CurrentUser() user: AuthUser) {
    return this.service.findMine(user.id);
  }

  // Без @RequirePermission — доступно бригадиру-владельцу задания
  // (проверка внутри сервиса по foremanId), либо начальнику участка/
  // бухгалтеру по обычному scope (сервис сам читает права по userId,
  // т.к. request.kernUser здесь не будет — см. TasksService.assertTaskInScope).
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.id, id);
  }

  @Patch(':id')
  @RequirePermission('task', 'update')
  update(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.service.update(user, id, dto);
  }

  @Get(':id/progress')
  progress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.progress(user.id, id);
  }

  @Post(':id/shift-assignments')
  setShiftAssignments(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetShiftAssignmentsDto) {
    return this.service.setShiftAssignments(user.id, id, dto);
  }
}

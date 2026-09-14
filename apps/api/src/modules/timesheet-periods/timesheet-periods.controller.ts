import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { TimesheetPeriodsService } from './timesheet-periods.service';
import { CreateTimesheetPeriodDto } from './dto/create-timesheet-period.dto';
import { UpdateTimesheetPeriodDto } from './dto/update-timesheet-period.dto';
import { RejectTimesheetPeriodDto } from './dto/reject-timesheet-period.dto';
import { SubmitTimesheetPeriodDto } from './dto/submit-timesheet-period.dto';
import { ApproveTimesheetPeriodDto } from './dto/approve-timesheet-period.dto';
import { ReopenDaysDto } from './dto/reopen-days.dto';

@Controller('timesheet-periods')
@UseGuards(JwtAuthGuard, RbacGuard)
export class TimesheetPeriodsController {
  constructor(private readonly service: TimesheetPeriodsService) {}

  @Post()
  @RequirePermission('timesheet_period', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreateTimesheetPeriodDto) {
    return this.service.create(user, dto);
  }

  @Get()
  @RequirePermission('timesheet_period', 'read')
  findByCrew(@CurrentKernUser() user: KernUser, @Query('crewId') crewId: string) {
    return this.service.findByCrew(user, crewId);
  }

  // Перед ':id' — иначе Nest примет 'pending-summary' за id.
  @Get('pending-summary')
  @RequirePermission('timesheet_period', 'read')
  pendingSummary(@CurrentKernUser() user: KernUser) {
    return this.service.pendingCounts(user);
  }

  @Get(':id')
  @RequirePermission('timesheet_period', 'read')
  findOne(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission('timesheet_period', 'update')
  update(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: UpdateTimesheetPeriodDto) {
    return this.service.update(user, id, dto);
  }

  // "Редактировать график" — тем же правом, что и update (бригадир
  // владеет содержанием своего табеля).
  @Post(':id/reopen-days')
  @RequirePermission('timesheet_period', 'update')
  reopenDays(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: ReopenDaysDto) {
    return this.service.reopenDays(user, id, dto);
  }

  @Post(':id/submit')
  @RequirePermission('timesheet_period', 'update')
  submit(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: SubmitTimesheetPeriodDto) {
    return this.service.submit(user, id, dto.comment);
  }

  @Post(':id/approve')
  @RequirePermission('timesheet_period', 'approve')
  approve(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: ApproveTimesheetPeriodDto) {
    return this.service.approve(user, id, dto.comment);
  }

  @Post(':id/reject')
  @RequirePermission('timesheet_period', 'approve')
  reject(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: RejectTimesheetPeriodDto) {
    return this.service.reject(user, id, dto.reason);
  }
}

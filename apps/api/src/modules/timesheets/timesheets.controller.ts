import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { TimesheetsService } from './timesheets.service';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';

@Controller('timesheets')
@UseGuards(JwtAuthGuard, RbacGuard)
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Post()
  @RequirePermission('timesheet', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreateTimesheetDto) {
    return this.timesheetsService.create(user, dto);
  }

  @Get()
  @RequirePermission('timesheet', 'read')
  findAll(@CurrentKernUser() user: KernUser) {
    return this.timesheetsService.findAll(user);
  }

  @Post(':id/submit')
  @RequirePermission('timesheet', 'update')
  submit(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.timesheetsService.transition(user, id, 'submitted');
  }

  @Post(':id/approve')
  @RequirePermission('timesheet', 'approve')
  approve(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.timesheetsService.transition(user, id, 'approved');
  }

  @Post(':id/lock')
  @RequirePermission('timesheet', 'lock')
  lock(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.timesheetsService.transition(user, id, 'locked');
  }
}

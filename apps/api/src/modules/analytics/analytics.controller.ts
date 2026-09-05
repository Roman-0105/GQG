import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { AnalyticsService } from './analytics.service';
import { TimeseriesQueryDto, TotalsQueryDto } from './dto/analytics-query.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('timeseries')
  @RequirePermission('analytics', 'read')
  timeseries(@CurrentKernUser() user: KernUser, @Query() q: TimeseriesQueryDto) {
    return this.analyticsService.timeseries(user, new Date(q.from), new Date(q.to), q.grain, q.siteId);
  }

  @Get('totals')
  @RequirePermission('analytics', 'read')
  totals(@CurrentKernUser() user: KernUser, @Query() q: TotalsQueryDto) {
    return this.analyticsService.totals(user, new Date(q.from), new Date(q.to), q.siteId);
  }

  @Get('budget')
  @RequirePermission('analytics', 'read')
  budget(@CurrentKernUser() user: KernUser, @Query() q: TotalsQueryDto) {
    return this.analyticsService.budgetVsActual(user, new Date(q.from), new Date(q.to), q.siteId);
  }
}

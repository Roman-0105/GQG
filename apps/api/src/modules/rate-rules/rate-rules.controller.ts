import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { RateRulesService } from './rate-rules.service';
import { CreateRateRuleDto } from './dto/create-rate-rule.dto';

@Controller('rate-rules')
@UseGuards(JwtAuthGuard, RbacGuard)
export class RateRulesController {
  constructor(private readonly rateRulesService: RateRulesService) {}

  @Post()
  @RequirePermission('rate_rule', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreateRateRuleDto) {
    return this.rateRulesService.create(user, dto);
  }

  @Get()
  @RequirePermission('rate_rule', 'read')
  findAll(@CurrentKernUser() user: KernUser) {
    return this.rateRulesService.findAll(user);
  }
}

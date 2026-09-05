import { Body, Controller, Get, Query, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CrewsService } from './crews.service';
import { CreateCrewDto } from './dto/create-crew.dto';

@Controller('crews')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrewsController {
  constructor(private readonly crewsService: CrewsService) {}

  @Post()
  @RequirePermission('crew', 'create')
  create(@Body() dto: CreateCrewDto) {
    return this.crewsService.create(dto);
  }

  // TODO(security-reviewer): findBySite не проверяет, что siteId входит в
  // scope пользователя (own_sites/company) — заглушка Этапа 00, закрыть
  // до конца Этапа 01 через buildSiteScopeWhere, как в SitesService.
  @Get()
  @RequirePermission('crew', 'read')
  findBySite(@Query('siteId') siteId: string) {
    return this.crewsService.findBySite(siteId);
  }
}

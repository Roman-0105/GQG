import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Controller('sites')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post()
  @RequirePermission('site', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreateSiteDto) {
    return this.sitesService.create(user, dto);
  }

  @Get()
  @RequirePermission('site', 'read')
  findAll(@CurrentKernUser() user: KernUser, @Query('archived') archived?: string) {
    return this.sitesService.findAll(user, archived === 'true');
  }

  @Get(':id')
  @RequirePermission('site', 'read')
  findOne(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.sitesService.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission('site', 'update')
  update(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(user, id, dto);
  }

  // Архивация — не удаление (см. Site.archivedAt в схеме): история
  // табелей и расчётов ЗП по участку остаётся нетронутой.
  @Post(':id/archive')
  @RequirePermission('site', 'delete')
  archive(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.sitesService.setArchived(user, id, true);
  }

  @Post(':id/unarchive')
  @RequirePermission('site', 'delete')
  unarchive(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.sitesService.setArchived(user, id, false);
  }
}

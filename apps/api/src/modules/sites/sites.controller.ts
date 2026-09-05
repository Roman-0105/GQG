import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';

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
  findAll(@CurrentKernUser() user: KernUser) {
    return this.sitesService.findAll(user);
  }

  @Get(':id')
  @RequirePermission('site', 'read')
  findOne(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.sitesService.findOne(user, id);
  }
}

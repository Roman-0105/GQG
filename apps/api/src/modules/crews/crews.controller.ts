import { Body, Controller, Get, Query, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { CrewsService } from './crews.service';
import { CreateCrewDto } from './dto/create-crew.dto';

@Controller('crews')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrewsController {
  constructor(private readonly crewsService: CrewsService) {}

  @Post()
  @RequirePermission('crew', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreateCrewDto) {
    return this.crewsService.create(user, dto);
  }

  @Get()
  @RequirePermission('crew', 'read')
  findBySite(@CurrentKernUser() user: KernUser, @Query('siteId') siteId: string) {
    return this.crewsService.findBySite(user, siteId);
  }
}

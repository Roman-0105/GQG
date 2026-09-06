import { Body, Controller, Delete, Get, Param, Patch, Query, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { CrewsService } from './crews.service';
import { CreateCrewDto } from './dto/create-crew.dto';
import { UpdateCrewDto } from './dto/update-crew.dto';

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

  /**
   * Бригады, где текущий пользователь — бригадир. Без @RequirePermission
   * намеренно: Бригадир по сиду не имеет общего права crew:read, но
   * обязан видеть свою же бригаду, чтобы внести табель (см. форму
   * табеля во frontend). Доступ ограничен самим запросом (foremanId =
   * request.user.id), а не правом — сузить нечего.
   */
  @Get('mine')
  findMine(@CurrentUser() user: AuthUser) {
    return this.crewsService.findMine(user.id);
  }

  @Patch(':id')
  @RequirePermission('crew', 'update')
  update(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: UpdateCrewDto) {
    return this.crewsService.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission('crew', 'delete')
  remove(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.crewsService.remove(user, id);
  }
}

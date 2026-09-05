import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';

@Controller('positions')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @RequirePermission('position', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreatePositionDto) {
    return this.positionsService.create(user, dto);
  }

  @Get()
  @RequirePermission('position', 'read')
  findAll(@CurrentKernUser() user: KernUser) {
    return this.positionsService.findAll(user);
  }
}

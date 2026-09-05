import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Controller('employees')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequirePermission('employee', 'create')
  create(@CurrentKernUser() user: KernUser, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(user, dto);
  }

  @Get()
  @RequirePermission('employee', 'read')
  findAll(@CurrentKernUser() user: KernUser) {
    return this.employeesService.findAll(user);
  }
}

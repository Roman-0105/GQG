import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

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

  @Patch(':id')
  @RequirePermission('employee', 'update')
  update(@CurrentKernUser() user: KernUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission('employee', 'delete')
  remove(@CurrentKernUser() user: KernUser, @Param('id') id: string) {
    return this.employeesService.remove(user, id);
  }
}

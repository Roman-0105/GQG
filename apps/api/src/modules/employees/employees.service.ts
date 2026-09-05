import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: KernUser, dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: {
        companyId: user.companyId,
        fullName: dto.fullName,
        positionId: dto.positionId,
        crewId: dto.crewId,
        employmentType: dto.employmentType ?? 'staff',
      },
    });
  }

  findAll(user: KernUser) {
    return this.prisma.employee.findMany({
      where: { companyId: user.companyId, isActive: true },
      include: { position: true, crew: true },
    });
  }
}

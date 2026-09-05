import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCrewDto } from './dto/create-crew.dto';

@Injectable()
export class CrewsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCrewDto) {
    return this.prisma.crew.create({ data: dto });
  }

  findBySite(siteId: string) {
    return this.prisma.crew.findMany({ where: { siteId }, include: { members: true, foreman: true } });
  }
}

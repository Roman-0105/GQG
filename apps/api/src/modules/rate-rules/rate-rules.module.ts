import { Module } from '@nestjs/common';
import { RateRulesController } from './rate-rules.controller';
import { RateRulesService } from './rate-rules.service';

@Module({
  controllers: [RateRulesController],
  providers: [RateRulesService],
})
export class RateRulesModule {}

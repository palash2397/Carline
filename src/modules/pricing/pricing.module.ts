import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PricingRule, PricingRuleSchema } from './schema/pricing.schema';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PricingRule.name, schema: PricingRuleSchema },
    ]),
  ],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService, MongooseModule],
})
export class PricingModule {}

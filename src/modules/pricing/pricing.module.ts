import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PricingRule, PricingRuleSchema } from './schema/pricing.schema';
import { ZoneName, ZoneNameSchema } from './schema/zone-name.schema';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PricingRule.name, schema: PricingRuleSchema },
      { name: ZoneName.name, schema: ZoneNameSchema },
    ]),
  ],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService, MongooseModule],
})
export class PricingModule {}


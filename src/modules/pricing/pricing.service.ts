import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PricingRule, PricingRuleDocument } from './schema/pricing.schema';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(PricingRule.name)
    private pricingRuleModel: Model<PricingRuleDocument>,
  ) {}

  async getPricingConfig(): Promise<PricingRuleDocument> {
    let config = await this.pricingRuleModel.findOne();
    if (!config) {
      config = new this.pricingRuleModel({
        baseFare: 2.0,
        baseTimeMinutes: 5,
        perMinuteRate: 2.0,
        currency: 'USD',
      });
      await config.save();
    }
    return config;
  }

  async getPricing() {
    try {
      const config = await this.getPricingConfig();
      return new ApiResponse(200, config, Msg.DATA_FETCHED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updatePricing(dto: UpdatePricingDto) {
    try {
      let config = await this.pricingRuleModel.findOne();
      if (!config) {
        config = new this.pricingRuleModel(dto);
      } else {
        config.baseFare = dto.baseFare;
        config.baseTimeMinutes = dto.baseTimeMinutes;
        config.perMinuteRate = dto.perMinuteRate;
        if (dto.currency) {
          config.currency = dto.currency;
        }
      }
      await config.save();
      return new ApiResponse(200, config, Msg.DATA_UPDATED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async calculateFare(durationMinutes: number) {
    const config = await this.getPricingConfig();
    const baseFare = config.baseFare ?? 2.0;
    const baseTimeMinutes = config.baseTimeMinutes ?? 5;
    const perMinuteRate = config.perMinuteRate ?? 2.0;
    const currency = config.currency || 'USD';

    const extraMinutes = Math.max(0, durationMinutes - baseTimeMinutes);
    const calculatedFare = Number(
      (baseFare + extraMinutes * perMinuteRate).toFixed(2),
    );

    return {
      durationMinutes,
      baseFare,
      baseTimeMinutes,
      perMinuteRate,
      extraMinutes,
      calculatedFare,
      finalFare: calculatedFare,
      currency,
    };
  }
}

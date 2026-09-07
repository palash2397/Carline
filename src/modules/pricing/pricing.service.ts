import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PricingRule, PricingRuleDocument } from './schema/pricing.schema';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { ZoneEnum } from 'src/common/enums/pricing/zone.enum';
import { DayOfWeekEnum } from 'src/common/enums/pricing/day-of-week.enum';

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(PricingRule.name)
    private pricingRuleModel: Model<PricingRuleDocument>,
  ) {}

  async createRule(dto: CreatePricingRuleDto) {
    try {
      const rule = new this.pricingRuleModel(dto);
      await rule.save();
      return new ApiResponse(201, rule, 'Pricing rule created successfully');
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getRules(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (query.zone) {
        filter.zone = query.zone;
      }
      if (query.day) {
        filter.days = query.day;
      }
      if (query.search) {
        filter.ruleName = { $regex: query.search, $options: 'i' };
      }

      const total = await this.pricingRuleModel.countDocuments(filter);
      const data = await this.pricingRuleModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      return new ApiResponse(
        200,
        { data, total, page, limit },
        Msg.DATA_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getRuleById(id: string) {
    try {
      const rule = await this.pricingRuleModel.findById(id);
      if (!rule) {
        return new ApiResponse(404, {}, 'Pricing rule not found');
      }
      return new ApiResponse(200, rule, Msg.DATA_FETCHED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateRule(id: string, dto: UpdatePricingRuleDto) {
    try {
      const updatedRule = await this.pricingRuleModel.findByIdAndUpdate(
        id,
        { $set: dto },
        { new: true, runValidators: true },
      );
      if (!updatedRule) {
        return new ApiResponse(404, {}, 'Pricing rule not found');
      }
      return new ApiResponse(200, updatedRule, Msg.DATA_UPDATED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async deleteRule(id: string) {
    try {
      const deletedRule = await this.pricingRuleModel.findByIdAndDelete(id);
      if (!deletedRule) {
        return new ApiResponse(404, {}, 'Pricing rule not found');
      }
      return new ApiResponse(200, {}, Msg.DATA_DELETED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async calculateZoneFare(
    zoneInput: string,
    durationMinutes: number,
    startDateTime?: string,
  ) {
    // Map digit or string to ZoneEnum
    let targetZone: ZoneEnum = ZoneEnum.ZONE_1;
    if (zoneInput === '1' || zoneInput === ZoneEnum.ZONE_1 || zoneInput === 'ZONE_1') {
      targetZone = ZoneEnum.ZONE_1;
    } else if (zoneInput === '2' || zoneInput === ZoneEnum.ZONE_2 || zoneInput === 'ZONE_2') {
      targetZone = ZoneEnum.ZONE_2;
    } else if (zoneInput === '3' || zoneInput === ZoneEnum.ZONE_3 || zoneInput === 'ZONE_3') {
      targetZone = ZoneEnum.ZONE_3;
    } else if (zoneInput === '4' || zoneInput === ZoneEnum.ZONE_4 || zoneInput === 'ZONE_4') {
      targetZone = ZoneEnum.ZONE_4;
    }

    const dateObj = startDateTime ? new Date(startDateTime) : new Date();
    const dayNames = [
      DayOfWeekEnum.SUNDAY,
      DayOfWeekEnum.MONDAY,
      DayOfWeekEnum.TUESDAY,
      DayOfWeekEnum.WEDNESDAY,
      DayOfWeekEnum.THURSDAY,
      DayOfWeekEnum.FRIDAY,
      DayOfWeekEnum.SATURDAY,
    ];
    const currentDay = dayNames[dateObj.getDay()];
    const currentHour = dateObj.getHours();

    // Query active rule matching Zone, Day, and Hour range
    let matchingRule = await this.pricingRuleModel
      .findOne({
        zone: targetZone,
        days: currentDay,
        startHour: { $lte: currentHour },
        endHour: { $gte: currentHour },
        isActive: true,
      })
      .sort({ createdAt: -1 });

    // Fallback: match Zone & Day regardless of hour
    if (!matchingRule) {
      matchingRule = await this.pricingRuleModel
        .findOne({
          zone: targetZone,
          days: currentDay,
          isActive: true,
        })
        .sort({ createdAt: -1 });
    }

    // Fallback: match Zone default rule
    if (!matchingRule) {
      matchingRule = await this.pricingRuleModel
        .findOne({
          zone: targetZone,
          isActive: true,
        })
        .sort({ createdAt: -1 });
    }

    const baseFare = matchingRule ? matchingRule.baseFare : 2.0;
    const freeMinutes = matchingRule ? matchingRule.freeMinutes : 5;
    const perMinuteRate = matchingRule ? matchingRule.perMinuteRate : 2.0;
    const currency = matchingRule ? matchingRule.currency : 'USD';

    const extraMinutes = Math.max(0, durationMinutes - freeMinutes);
    const calculatedFare = Number(
      (baseFare + extraMinutes * perMinuteRate).toFixed(2),
    );

    return {
      zone: targetZone,
      durationMinutes,
      baseFare,
      freeMinutes,
      baseTimeMinutes: freeMinutes,
      perMinuteRate,
      extraMinutes,
      calculatedFare,
      finalFare: calculatedFare,
      currency,
      matchedRule: matchingRule ? matchingRule.ruleName : 'Default Fallback Rule',
    };
  }

  async calculateFare(durationMinutes: number, zoneInput = '1') {
    return this.calculateZoneFare(zoneInput, durationMinutes);
  }
}

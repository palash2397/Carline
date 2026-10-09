import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PricingRule, PricingRuleDocument } from './schema/pricing.schema';
import { ZoneName, ZoneNameDocument } from './schema/zone-name.schema';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { UpdateZoneNamesDto } from './dto/update-zone-names.dto';
import { BulkUpdatePricingDto } from './dto/bulk-update-pricing.dto';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { ZoneEnum } from 'src/common/enums/pricing/zone.enum';
import { DayOfWeekEnum } from 'src/common/enums/pricing/day-of-week.enum';

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(PricingRule.name)
    private pricingRuleModel: Model<PricingRuleDocument>,
    @InjectModel(ZoneName.name)
    private zoneNameModel: Model<ZoneNameDocument>,
  ) {}

  async getZoneNames() {
    try {
      let zoneNames = await this.zoneNameModel.findOne();
      if (!zoneNames) {
        zoneNames = await this.zoneNameModel.create({});
      }
      return new ApiResponse(200, zoneNames, Msg.DATA_FETCHED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateZoneNames(dto: UpdateZoneNamesDto) {
    try {
      let zoneNames = await this.zoneNameModel.findOne();
      if (!zoneNames) {
        zoneNames = new this.zoneNameModel(dto);
      } else {
        Object.assign(zoneNames, dto);
      }
      await zoneNames.save();
      return new ApiResponse(200, zoneNames, Msg.DATA_UPDATED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  normalizeZone(zoneInput?: string): ZoneEnum {
    if (!zoneInput) return ZoneEnum.ZONE_1;
    const clean = zoneInput.toString().trim().toUpperCase().replace(/[\s\-_]/g, '');
    if (clean === '1' || clean === 'ZONE1' || clean.includes('LOCAL')) {
      return ZoneEnum.ZONE_1;
    }
    if (clean === '2' || clean === 'ZONE2' || clean.includes('SEMI') || clean.includes('SAMI')) {
      return ZoneEnum.ZONE_2;
    }
    if (clean === '3' || clean === 'ZONE3' || clean.includes('GLILUS') || clean.includes('GHIVELOS')) {
      return ZoneEnum.ZONE_3;
    }
    if (clean === '4' || clean === 'ZONE4') {
      return ZoneEnum.ZONE_4;
    }
    return ZoneEnum.ZONE_1;
  }

  async getPricingMatrix(zoneInput?: string) {
    try {
      const targetZone: ZoneEnum = this.normalizeZone(zoneInput);

      const rules = await this.pricingRuleModel.find({
        zone: targetZone,
        isActive: true,
      });

      const days = [
        DayOfWeekEnum.SUNDAY,
        DayOfWeekEnum.MONDAY,
        DayOfWeekEnum.TUESDAY,
        DayOfWeekEnum.WEDNESDAY,
        DayOfWeekEnum.THURSDAY,
        DayOfWeekEnum.FRIDAY,
        DayOfWeekEnum.SATURDAY,
      ];

      // Build 168 slots matrix (7 days x 24 hours)
      const matrix: any[] = [];

      for (const day of days) {
        for (let hour = 0; hour < 24; hour++) {
          const matchingRule = rules.find(
            (r) =>
              r.days.includes(day) &&
              r.startHour <= hour &&
              r.endHour >= hour,
          );

          matrix.push({
            day,
            hour,
            baseFare: matchingRule ? matchingRule.baseFare : 2.0,
            freeMinutes: matchingRule ? matchingRule.freeMinutes : 5,
            perMinuteRate: matchingRule ? matchingRule.perMinuteRate : 2.0,
            currency: matchingRule ? matchingRule.currency : 'USD',
            ruleId: matchingRule ? matchingRule._id : null,
            ruleName: matchingRule ? matchingRule.ruleName : 'Default',
          });
        }
      }

      const zoneNamesDoc = await this.zoneNameModel.findOne();
      const zoneNames = zoneNamesDoc || {
        zone1Name: 'KJ LOCAL',
        zone2Name: 'sami Ghivelos',
        zone3Name: 'To From Ghivelos',
        zone4Name: 'Ghivelos 2 ghivelos',
      };

      return new ApiResponse(
        200,
        {
          zone: targetZone,
          zoneNames,
          totalSlots: matrix.length, // 168
          matrix,
        },
        Msg.DATA_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async bulkUpdatePricing(dto: BulkUpdatePricingDto) {
    try {
      const { zone, slots, baseFare, freeMinutes, perMinuteRate, currency } = dto;

      if (!slots || slots.length === 0) {
        return new ApiResponse(400, {}, 'No slots provided for bulk update');
      }

      const bulkOps: any[] = [];

      for (const slot of slots) {
        const ruleName = `${zone}_${slot.day}_Hour_${slot.hour}`;

        bulkOps.push({
          updateOne: {
            filter: {
              zone,
              days: slot.day,
              startHour: slot.hour,
              endHour: slot.hour,
            },
            update: {
              $set: {
                ruleName,
                zone,
                days: [slot.day],
                startHour: slot.hour,
                endHour: slot.hour,
                baseFare,
                freeMinutes,
                perMinuteRate,
                currency: currency || 'USD',
                isActive: true,
              },
            },
            upsert: true,
          },
        });
      }

      if (bulkOps.length > 0) {
        await this.pricingRuleModel.bulkWrite(bulkOps);
      }

      return new ApiResponse(
        200,
        {
          zone,
          updatedSlotsCount: slots.length,
          baseFare,
          freeMinutes,
          perMinuteRate,
        },
        'Bulk pricing update applied successfully',
      );
    } catch (error) {
      console.error('Bulk pricing update error:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

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
    // Map digit or string to ZoneEnum safely
    const targetZone: ZoneEnum = this.normalizeZone(zoneInput);

    const safeDuration = Math.max(0, Math.round(Number(durationMinutes) || 0));

    // Ensure valid start date, default to now
    let dateObj = new Date();
    if (startDateTime && !isNaN(new Date(startDateTime).getTime())) {
      dateObj = new Date(startDateTime);
    }

    const timeZone = process.env.TIMEZONE || 'America/New_York';

    let currentDay: DayOfWeekEnum;
    let currentHour: number;

    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'long',
        hour: 'numeric',
        hourCycle: 'h23',
      }).formatToParts(dateObj);

      const dayStr = parts.find((p) => p.type === 'weekday')?.value?.toUpperCase();
      currentDay =
        (DayOfWeekEnum as any)[dayStr || ''] || DayOfWeekEnum.MONDAY;
      const rawHour = parseInt(
        parts.find((p) => p.type === 'hour')?.value || '0',
        10,
      );
      currentHour = rawHour === 24 ? 0 : Math.min(23, Math.max(0, rawHour));
    } catch (e) {
      // Fallback computing in America/New_York safely
      const nyDate = new Date(
        dateObj.toLocaleString('en-US', { timeZone: 'America/New_York' }),
      );
      const dayNames = [
        DayOfWeekEnum.SUNDAY,
        DayOfWeekEnum.MONDAY,
        DayOfWeekEnum.TUESDAY,
        DayOfWeekEnum.WEDNESDAY,
        DayOfWeekEnum.THURSDAY,
        DayOfWeekEnum.FRIDAY,
        DayOfWeekEnum.SATURDAY,
      ];
      currentDay = dayNames[nyDate.getDay()];
      currentHour = nyDate.getHours();
    }

    // 1. Query active candidate rules matching Zone, Day, and Hour window
    const candidates = await this.pricingRuleModel
      .find({
        zone: targetZone,
        days: currentDay,
        startHour: { $lte: currentHour },
        endHour: { $gte: currentHour },
        isActive: true,
      })
      .lean();

    let matchingRule: any = null;

    if (candidates && candidates.length > 0) {
      // Prioritize the most specific rule first:
      // Smaller time span (e.g. 1-hour slot beats 24-hour broad rule)
      // Then most recently updated
      candidates.sort((a, b) => {
        const spanA = a.endHour - a.startHour;
        const spanB = b.endHour - b.startHour;
        if (spanA !== spanB) {
          return spanA - spanB;
        }
        return (
          new Date(b['updatedAt'] || b['createdAt'] || 0).getTime() -
          new Date(a['updatedAt'] || a['createdAt'] || 0).getTime()
        );
      });
      matchingRule = candidates[0];
    }

    // 2. Fallback: match 24/7 or all-day default rule for that day in this zone (0-23)
    if (!matchingRule) {
      matchingRule = await this.pricingRuleModel
        .findOne({
          zone: targetZone,
          days: currentDay,
          startHour: 0,
          endHour: 23,
          isActive: true,
        })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
    }

    // 3. Fallback: match all-day general rule across all days in this zone
    if (!matchingRule) {
      matchingRule = await this.pricingRuleModel
        .findOne({
          zone: targetZone,
          startHour: 0,
          endHour: 23,
          isActive: true,
        })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
    }

    // 4. Fallback: match standard active rule for this zone (sorted by lowest baseFare as baseline)
    if (!matchingRule) {
      matchingRule = await this.pricingRuleModel
        .findOne({
          zone: targetZone,
          isActive: true,
        })
        .sort({ baseFare: 1, createdAt: -1 })
        .lean();
    }

    // Baseline defaults if database has zero rules initialized
    const baseFare = matchingRule ? Number(matchingRule.baseFare) : 2.0;
    const freeMinutes = matchingRule ? Number(matchingRule.freeMinutes) : 5;
    const perMinuteRate = matchingRule ? Number(matchingRule.perMinuteRate) : 2.0;
    const currency = matchingRule ? matchingRule.currency : 'USD';

    const extraMinutes = Math.max(0, safeDuration - freeMinutes);
    const calculatedFare = Number(
      (baseFare + extraMinutes * perMinuteRate).toFixed(2),
    );

    return {
      zone: targetZone,
      durationMinutes: safeDuration,
      baseFare,
      freeMinutes,
      baseTimeMinutes: freeMinutes,
      perMinuteRate,
      extraMinutes,
      calculatedFare,
      finalFare: calculatedFare,
      currency,
      matchedRule: matchingRule
        ? matchingRule.ruleName
        : 'Default Fallback Rule',
    };
  }

  async calculateFare(durationMinutes: number, zoneInput = '1') {
    return this.calculateZoneFare(zoneInput, durationMinutes);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { ZoneEnum } from 'src/common/enums/pricing/zone.enum';
import { DayOfWeekEnum } from 'src/common/enums/pricing/day-of-week.enum';

@ApiTags('Pricing Rules')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('/rules')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async createRule(@Body() dto: CreatePricingRuleDto) {
    return this.pricingService.createRule(dto);
  }

  @Get('/rules')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'zone', required: false, enum: ZoneEnum })
  @ApiQuery({ name: 'day', required: false, enum: DayOfWeekEnum })
  @ApiQuery({ name: 'search', required: false, type: String })
  async getRules(@Query() query: any) {
    return this.pricingService.getRules(query);
  }

  @Get('/rules/:id')
  async getRuleById(@Param('id') id: string) {
    return this.pricingService.getRuleById(id);
  }

  @Put('/rules/:id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async updateRule(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto) {
    return this.pricingService.updateRule(id, dto);
  }

  @Delete('/rules/:id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async deleteRule(@Param('id') id: string) {
    return this.pricingService.deleteRule(id);
  }

  @Post('/calculate')
  async calculateFare(
    @Body()
    body: {
      zone: string;
      durationMinutes: number;
      startDateTime?: string;
    },
  ) {
    return this.pricingService.calculateZoneFare(
      body.zone,
      body.durationMinutes,
      body.startDateTime,
    );
  }
}

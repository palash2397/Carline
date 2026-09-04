import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('/')
  async getPricing() {
    return this.pricingService.getPricing();
  }

  @Put('/')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async updatePricing(@Body() dto: UpdatePricingDto) {
    return this.pricingService.updatePricing(dto);
  }
}

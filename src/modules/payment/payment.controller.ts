import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { ProcessCardPaymentDto } from './dto/process-card-payment.dto';
import { ChargeRidePaymentDto } from './dto/charge-ride-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { SaveCardDto } from './dto/save-card.dto';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';

@ApiTags('USAePay Payment Gateway')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('/save-card')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async saveCustomerVaultCard(@Body() dto: SaveCardDto) {
    return this.paymentService.saveCustomerVaultCard(dto);
  }

  @Post('/process-card')
  // @ApiBearerAuth('access-token')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DRIVER)
  async processCardSale(@Body() dto: ProcessCardPaymentDto) {
    return this.paymentService.processCardSale(dto);
  }

  @Post('/charge-ride')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async chargeRideVault(@Body() dto: ChargeRidePaymentDto) {
    return this.paymentService.chargeRideVault(dto);
  }

  @Post('/ivr-charge')
  @UseGuards(ApiKeyGuard)
  @ApiHeader({
    name: 'x-api-key',
    description: 'API key for IVR service access',
    required: true,
  })
  async ivrChargeRideVault(@Body() dto: ChargeRidePaymentDto) {
    return this.paymentService.chargeRideVault(dto);
  }

  @Get('/customer-card/:customerNumber')
  @UseGuards(ApiKeyGuard)
  @ApiHeader({
    name: 'x-api-key',
    description: 'API key for IVR service access',
    required: true,
  })
  @ApiParam({
    name: 'customerNumber',
    description: 'Customer mobile number (e.g. 9074775130)',
    example: '9074775130',
  })
  async getCustomerCardDetails(
    @Param('customerNumber') customerNumber: string,
  ) {
    return this.paymentService.getCustomerCardDetails(customerNumber);
  }

  @Post('/refund')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async refundTransaction(@Body() dto: RefundPaymentDto) {
    return this.paymentService.refundTransaction(dto);
  }

  @Get('/logs')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLogs(@Query() query: any) {
    return this.paymentService.getLogs(query);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from 'src/modules/auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { FundCustomerDto } from './dto/fund-customer.dto';
import { DeductCustomerDto } from './dto/deduct-customer.dto';
import { AdjustCustomerBalanceDto } from './dto/adjust-customer-balance.dto';

@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiTags('Customer')
@Controller('customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get('/all')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination (e.g. 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (e.g. 10)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term to filter results',
  })
  async getCustomers(@Query() query: any) {
    return this.customerService.getCustomers(query);
  }

  @Get('/balance-history/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Get customer balance adjustment history',
    description:
      'Returns paginated history of all balance additions and deductions with reasons, dates, and admin who performed them.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCustomerBalanceHistoryAlt(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.customerService.getBalanceHistory(id, { page, limit });
  }

  @Get('/:id/balance-history')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Get customer balance adjustment history',
    description:
      'Returns paginated history of all balance additions and deductions with reasons, dates, and admin who performed them.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCustomerBalanceHistory(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.customerService.getBalanceHistory(id, { page, limit });
  }

  @Get('/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async getCustomerById(@Param('id') id: string) {
    return this.customerService.getCustomerById(id);
  }

  @Post('/add')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async createCustomer(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customerService.createCustomer(createCustomerDto);
  }

  @Put('/update')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async updateCustomer(@Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customerService.updateCustomer(updateCustomerDto);
  }

  @Delete('/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async deleteCustomerRest(@Param('id') id: string) {
    return this.customerService.deleteCustomer(id);
  }

  @Post('/add-credit')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Manually add credit/balance to customer account',
    description:
      'Increases customer balance and logs an adjustment history record with amount, reason, date/time, and admin user.',
  })
  @ApiBody({ type: FundCustomerDto })
  async addCustomerCredit(
    @Req() req: any,
    @Body() fundCustomerDto: FundCustomerDto,
  ) {
    return this.customerService.addCredit(fundCustomerDto, req?.user);
  }

  @Post('/deduct-credit')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Manually deduct credit/balance from customer account',
    description:
      'Deducts an amount from customer balance, checks for sufficient funds, and logs an adjustment history record.',
  })
  @ApiBody({ type: DeductCustomerDto })
  async deductCustomerCredit(
    @Req() req: any,
    @Body() deductCustomerDto: DeductCustomerDto,
  ) {
    return this.customerService.deductCredit(deductCustomerDto, req?.user);
  }

  @Post('/adjust-balance')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Unified balance adjustment (Add or Deduct)',
    description:
      'Supports action=ADD or action=DEDUCT, records reason and admin information, and returns updated balance.',
  })
  @ApiBody({ type: AdjustCustomerBalanceDto })
  async adjustCustomerBalance(
    @Req() req: any,
    @Body() dto: AdjustCustomerBalanceDto,
  ) {
    return this.customerService.adjustBalance(dto, req?.user);
  }

  @Post('/fund-credit')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Fund customer credit from saved credit card on file',
    description:
      'Charges customer credit card token in USAePay vault and adds funds to their prepaid balance.',
  })
  @ApiBody({ type: FundCustomerDto })
  async fundCustomerCreditFromCard(
    @Req() req: any,
    @Body() fundCustomerDto: FundCustomerDto,
  ) {
    return this.customerService.fundCreditFromCard(fundCustomerDto, req?.user);
  }
}

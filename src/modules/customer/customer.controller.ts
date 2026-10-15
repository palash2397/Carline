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
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Filter customers created from date (YYYY-MM-DD or ISO string)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'Filter customers created up to date (YYYY-MM-DD or ISO string)',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'Filter customers for a single date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'fromTime',
    required: false,
    type: String,
    description: 'Filter start time (HH:mm or HH:mm:ss)',
  })
  @ApiQuery({
    name: 'toTime',
    required: false,
    type: String,
    description: 'Filter end time (HH:mm or HH:mm:ss)',
  })
  @ApiQuery({
    name: 'hasCredit',
    required: false,
    type: Boolean,
    description: 'Filter customers with credit balance (true or false)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Field to sort by (default: customerId)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort direction (default: asc)',
  })
  async getCustomers(@Query() query: any) {
    return this.customerService.getCustomers(query);
  }
  @Get('/format-phone')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiQuery({
    name: 'phone',
    required: true,
    type: String,
    description: 'Phone number to format and validate',
    example: '+1 (347) 563-2341',
  })
  async formatPhone(@Query('phone') phone: string) {
    return this.customerService.formatPhone(phone);
  }

  @Get('/:id/balance-history')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Filter balance history from date (YYYY-MM-DD or ISO string)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'Filter balance history up to date (YYYY-MM-DD or ISO string)',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'Filter for a single day (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'fromTime',
    required: false,
    type: String,
    description: 'Filter start time (HH:mm or HH:mm:ss)',
  })
  @ApiQuery({
    name: 'toTime',
    required: false,
    type: String,
    description: 'Filter end time (HH:mm or HH:mm:ss)',
  })
  async getCustomerBalanceHistory(
    @Param('id') id: string,
    @Query() query: any,
  ) {
    return this.customerService.getBalanceHistory(id, query);
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
  @ApiBody({ type: FundCustomerDto })
  async addCustomerCredit(
    @Req() req: any,
    @Body() fundCustomerDto: FundCustomerDto,
  ) {
    return this.customerService.addCredit(fundCustomerDto, req?.user);
  }

  @Post('/deduct-credit')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiBody({ type: DeductCustomerDto })
  async deductCustomerCredit(
    @Req() req: any,
    @Body() deductCustomerDto: DeductCustomerDto,
  ) {
    return this.customerService.deductCredit(deductCustomerDto, req?.user);
  }

  @Post('/adjust-balance')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiBody({ type: AdjustCustomerBalanceDto })
  async adjustCustomerBalance(
    @Req() req: any,
    @Body() dto: AdjustCustomerBalanceDto,
  ) {
    return this.customerService.adjustBalance(dto, req?.user);
  }

  @Post('/fund-credit')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiBody({ type: FundCustomerDto })
  async fundCustomerCreditFromCard(
    @Req() req: any,
    @Body() fundCustomerDto: FundCustomerDto,
  ) {
    return this.customerService.fundCreditFromCard(fundCustomerDto, req?.user);
  }
}

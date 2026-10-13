import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RideService } from './ride.service';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from 'src/modules/auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { BookIvrRideDto } from './dto/book-ivr-ride.dto';
import { AdminDispatchDto } from './dto/admin-dispatch.dto';

@ApiTags('Ride')
@Controller('ride')
export class RideController {
  constructor(private readonly rideService: RideService) {}

  @Get('/all')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
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
    description: 'Search term to filter results by trip number, customer, or driver',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'PENDING',
      'ACCEPTED',
      'STARTED',
      'PAYMENT_PENDING',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'ONGOING',
    ],
    description: 'Filter rides by status (B5)',
  })
  @ApiQuery({
    name: 'queueName',
    required: false,
    enum: ['LOCAL', 'LONG_DISTANCE', 'BOTH'],
    description: 'Filter rides by queue (B5)',
  })
  @ApiQuery({
    name: 'driverId',
    required: false,
    type: String,
    description: 'Filter rides by Driver ID or phone number',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    type: String,
    description: 'Filter rides by Customer ID or phone number',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Filter rides starting from date (YYYY-MM-DD or ISO string)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'Filter rides up to date (YYYY-MM-DD or ISO string)',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'Filter rides for a single date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    description: 'Filter rides by payment status',
  })
  @ApiQuery({
    name: 'paymentType',
    required: false,
    enum: ['CASH', 'CREDIT_CARD', 'ACCOUNT'],
    description: 'Filter rides by payment method',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Field to sort by (default: createdAt)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort direction (default: desc)',
  })
  @ApiQuery({
    name: 'includeCounts',
    required: false,
    type: Boolean,
    description: 'Set true to include live operational KPI counts in the response',
  })
  async getRides(@Query() query: any) {
    return this.rideService.getRides(query);
  }

  @Get('/driver/:driverId')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiParam({
    name: 'driverId',
    required: true,
    description: 'Driver MongoDB ID, numeric driverId, or phone number',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async getDriverRides(
    @Param('driverId') driverId: string,
    @Query() query: any,
  ) {
    return this.rideService.getDriverRides(driverId, query);
  }

  @Get('/customer/:customerId')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiParam({
    name: 'customerId',
    required: true,
    description: 'Customer MongoDB ID, numeric customerId, or phone number',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async getCustomerRides(
    @Param('customerId') customerId: string,
    @Query() query: any,
  ) {
    return this.rideService.getCustomerRides(customerId, query);
  }

  @Post('/ivr/book')
  @UseGuards(ApiKeyGuard)
  @ApiHeader({
    name: 'x-api-key',
    description: 'API key for IVR access',
    required: true,
  })
  async bookIvrRide(
    @Body() bookIvrRideDto: BookIvrRideDto,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
    @Headers('x-request-id') headerRequestId?: string,
  ) {
    if (!bookIvrRideDto.idempotencyKey && (headerIdempotencyKey || headerRequestId)) {
      bookIvrRideDto.idempotencyKey = headerIdempotencyKey || headerRequestId;
    }
    return this.rideService.bookIvrRide(bookIvrRideDto);
  }

  @Post('/admin/dispatch')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async adminDispatch(@Body() dto: AdminDispatchDto) {
    return this.rideService.adminDispatch(dto);
  }
}

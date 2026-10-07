import {
  Body,
  Controller,
  Get,
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
    description: 'Search term to filter results',
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
  async bookIvrRide(@Body() bookIvrRideDto: BookIvrRideDto) {
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

import { Body, Controller, Post, Req, UseGuards, Get } from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

import { RideService } from './ride.service';
import { BookRideDto } from './dto/book-ride.dto';
import { AcceptRideDto } from './dto/accept-ride.dto';
import { UpdateRideStatusDto } from './dto/ride-status-dto';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { CancelRideDto } from './dto/cancel-ride.dto';

@ApiTags('Ride')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('ride')
export class RideController {
  constructor(private readonly rideService: RideService) {}

  @Post('/bookRide')
  @Roles(UserRole.PASSENGER, UserRole.SUPERADMIN)
  bookRide(@Req() req: any, @Body() dto: BookRideDto) {
    return this.rideService.bookRide(req.user.id, dto);
  }

  @Post('/acceptRide')
  @Roles(UserRole.DRIVER, UserRole.SUPERADMIN)
  acceptRide(@Req() req: any, @Body() dto: AcceptRideDto) {
    return this.rideService.acceptRide(req.user.id, dto);
  }

  @Post('/cancelRide')
  @Roles(UserRole.PASSENGER, UserRole.SUPERADMIN, UserRole.DRIVER)
  cancelRide(@Req() req: any, @Body() dto: CancelRideDto) {
    return this.rideService.cancelRide(req.user.id, dto);
  }

  @Get('/active-driver-ride')
  @Roles(UserRole.DRIVER, UserRole.SUPERADMIN)
  activeDriverRide(@Req() req: any) {
    return this.rideService.driverActiveRide(req.user.id);
  }

  @Get('/active-user-ride')
  @Roles(UserRole.PASSENGER, UserRole.USER, UserRole.SUPERADMIN)
  activeUserRide(@Req() req: any) {
    return this.rideService.userActiveRide(req.user.id);
  }

  @Get('/user-ride-history')
  @Roles(UserRole.PASSENGER, UserRole.USER, UserRole.SUPERADMIN)
  userRideHistory(@Req() req: any) {
    return this.rideService.userRideHistory(req.user.id);
  }

  @Get('/driver-ride-history')
  @Roles(UserRole.DRIVER, UserRole.SUPERADMIN)
  driverRideHistory(@Req() req: any) {
    return this.rideService.driverRideHistory(req.user.id);
  }

  @Post('/update-ride-status')
  @Roles(UserRole.DRIVER, UserRole.SUPERADMIN)
  updateRideStatus(@Req() req: any, @Body() dto: UpdateRideStatusDto) {
    return this.rideService.updateRideStatus(req.user.id, dto);
  }
}

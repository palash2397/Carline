import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RideService } from './ride.service';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from 'src/modules/auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiTags('Ride')
@Controller('ride')
export class RideController {
  constructor(private readonly rideService: RideService) {}

  @Get('/all')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination (e.g. 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page (e.g. 10)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term to filter results' })
  async getRides(@Query() query: any) {
    return this.rideService.getRides(query);
  }
}

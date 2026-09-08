import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DriverService } from './driver.service';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiQuery, ApiTags } from '@nestjs/swagger';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from 'src/modules/auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateDriverEarningsDto } from './dto/update-driver-earnings.dto';

@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiTags('Driver')
@Controller('driver')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

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
    name: 'batch',
    required: false,
    type: Number,
    description: 'Filter drivers by batch number (e.g. 1, 2, 3)',
  })
  async getDrivers(@Query() query: any) {
    return this.driverService.getDrivers(query);
  }

  @ApiExcludeEndpoint()
  @Post('/sync-earnings')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async syncAllDriverEarnings() {
    return this.driverService.syncAllDriverEarnings();
  }

  @Get('/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async getDriverById(@Param('id') id: string) {
    return this.driverService.getDriverById(id);
  }

  @Get('/:id/earnings')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async getDriverEarningsSummary(@Param('id') id: string) {
    return this.driverService.getDriverEarningsSummary(id);
  }

  @Put('/earnings')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async updateDriverEarnings(
    @Body() updateDriverEarningsDto: UpdateDriverEarningsDto,
  ) {
    return this.driverService.updateDriverEarnings(updateDriverEarningsDto);
  }

  @Post('/add')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async addDriver(@Body() createDriverDto: CreateDriverDto) {
    return this.driverService.createDriver(createDriverDto);
  }

  @Put('/update/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async updateDriver(
    @Param('id') id: string,
    @Body() updateDriverDto: UpdateDriverDto,
  ) {
    return this.driverService.updateDriver(id, updateDriverDto);
  }
}

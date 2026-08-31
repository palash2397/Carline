import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { DriverService } from './driver.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from 'src/modules/auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiTags('Driver')
@Controller('driver')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get('/all')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async getDrivers(@Query() query: any) {
    return this.driverService.getDrivers(query);
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

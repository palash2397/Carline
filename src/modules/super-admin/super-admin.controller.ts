import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminLoginDto } from '../auth/dto/superadmin-login.dto';
import { DriverStatusDto } from './dto/driver-status.dto';
import { CompanyStatusDto } from './dto/company-status.dto';

import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';

@ApiTags('Super Admin')
@Controller('super-admin')
@Roles(UserRole.SUPERADMIN)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('/login')
  login(@Body() dto: SuperAdminLoginDto) {
    return this.superAdminService.login(dto);
  }

  @Get('/all/drivers')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  getAllDrivers() {
    return this.superAdminService.allDrivers();
  }

  @Get('/driver/:id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  getDriverById(@Param('id') id: string) {
    return this.superAdminService.driverById(id);
  }

  @Patch('/driver/update/status')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RoleGuard)
  updateDriverStatus(@Body() dto: DriverStatusDto) {
    return this.superAdminService.approveOrRejectDriver(dto);
  }
}

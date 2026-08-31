import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from 'src/modules/auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiTags('Customer')
@Controller('customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get('/all')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async getCustomers(@Query() query: any) {
    return this.customerService.getCustomers(query);
  }
}

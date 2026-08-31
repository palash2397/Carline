import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

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
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination (e.g. 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page (e.g. 10)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term to filter results' })
  async getCustomers(@Query() query: any) {
    return this.customerService.getCustomers(query);
  }
}

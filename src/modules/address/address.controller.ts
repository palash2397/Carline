import { AddressService } from './address.service';

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

// import { RoleGuard } from '../auth/roles/roles.guard';
// import { Roles } from 'src/modules/auth/roles/roles.decorator';

import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('Address')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post('/add')
  createAddress(@Req() req: any, @Body() dto: CreateAddressDto) {
    return this.addressService.createAddress(req.user.id, dto);
  }

  @Get('/')
  getMyAddresses(@Req() req: any) {
    return this.addressService.myAddress(req.user.id);
  }

  @Patch('/:id')
  updateAddress(
    @Req() req: any,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressService.updateAddress(req.user.id, addressId, dto);
  }

  @Delete('/:id')
  deleteAddress(@Req() req: any, @Param('id') addressId: string) {
    return this.addressService.deleteAddress(req.user.id, addressId);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { RideTypeService } from './ride-type.service';
import { CreateRideTypeDto } from './dto/create-ride-type.dto';
import { UpdateRideTypeDto } from './dto/update-ride-type.dto';
import { EstimateFareDto } from './dto/estimate-fare.dto';

import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';
import { multerConfig } from 'src/common/middlewares/multer';

@ApiTags('Ride Type')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RoleGuard)
@Controller('ride-type')
export class RideTypeController {
  constructor(private readonly rideTypeService: RideTypeService) {}

  @Post('/add')
  @Roles(UserRole.SUPERADMIN, UserRole.PASSENGER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', multerConfig('ride-type')))
  createRideType(
    @Body() dto: CreateRideTypeDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.rideTypeService.createRideType(dto, file);
  }

  @Get('/')
  @Roles(UserRole.PASSENGER, UserRole.DRIVER, UserRole.SUPERADMIN)
  getRideTypes() {
    return this.rideTypeService.getRideTypes();
  }

  @Patch('/:id')
  @Roles(UserRole.SUPERADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', multerConfig('ride-type')))
  updateRideType(
    @Param('id') id: string,
    @Body() dto: UpdateRideTypeDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.rideTypeService.updateRideType(id, dto, file);
  }

  @Delete('/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.PASSENGER)
  deleteRideType(@Param('id') id: string) {
    return this.rideTypeService.deleteRideType(id);
  }

  @Post('/estimateFare')
  @Roles(UserRole.SUPERADMIN, UserRole.PASSENGER)
  estimateFare(@Body() dto: EstimateFareDto) {
    return this.rideTypeService.estimateFare(dto);
  }
}

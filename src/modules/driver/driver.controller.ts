import {
  Controller,
  Patch,
  Body,
  UseGuards,
  Req,
  Get,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { multerConfig } from 'src/common/middlewares/multer';

import { DriverService } from './driver.service';
import { UpdateDriverBasicDetailsDto } from './dto/update-driver-basic-details.dto';
import { UpdateDriverDocumentsDto } from './dto/update-driver-documents.dto';

@ApiTags('Driver')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('driver')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get('/profile')
  getMyProfile(@Req() req: any) {
    return this.driverService.myProfile(req.user.id);
  }

  @Patch('/status/toggle')
  toggleStatus(@Req() req: any) {
    return this.driverService.toggleStatus(req.user.id);
  }

  @Patch('/basic-details')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('avatar', multerConfig('profile')))
  updateBasicDetails(
    @Req() req: any,
    @Body() dto: UpdateDriverBasicDetailsDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.driverService.updateBasicDetails(req.user.id, dto, file);
  }

  @Patch('/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'nationalIdFront', maxCount: 1 },
        { name: 'nationalIdBack', maxCount: 1 },
        { name: 'driverLicenseFront', maxCount: 1 },
        { name: 'driverLicenseBack', maxCount: 1 },
        { name: 'vehicleRegistrationFront', maxCount: 1 },
        { name: 'vehicleRegistrationBack', maxCount: 1 },
        { name: 'vehiclePhotos', maxCount: 4 },
      ],
      multerConfig('driver'),
    ),
  )
  updateDocuments(
    @Req() req: any,
    @Body() dto: UpdateDriverDocumentsDto,
    @UploadedFiles() files?: any,
  ) {
    return this.driverService.updateDocuments(req.user.id, files);
  }
}

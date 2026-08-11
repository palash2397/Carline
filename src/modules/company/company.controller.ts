import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Req,
  Param,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { AddCompanyCarDto } from './dto/add-company-car.dto';
import { UpdateCompanyCarDto } from './dto/update-company-car.dto';
import { LoginCompanyDto } from './dto/login-company.dto';
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { multerConfig } from 'src/common/middlewares/multer';

import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { UserRole } from 'src/common/enums/user/role.enum';

@ApiTags('Company')
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post('/register')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('documents', 10, multerConfig('company')))
  register(
    @Body() dto: RegisterCompanyDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.companyService.register(dto, files);
  }

  @Post('/login')
  login(@Body() dto: LoginCompanyDto) {
    return this.companyService.login(dto);
  }

  @Get('/my')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard)
  myProfile(@Req() req: any) {
    // console.log(req.user);
    return this.companyService.myProfile(req.user?.id);
  }

  @Post('/car')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'vehiclePhotos', maxCount: 6 },
        { name: 'insuranceInvoice', maxCount: 1 },
        { name: 'registrationCardImage', maxCount: 1 },
      ],
      multerConfig('company-car'),
    ),
  )
  addCar(
    @Req() req: any,
    @Body() dto: AddCompanyCarDto,
    @UploadedFiles()
    files: {
      vehiclePhotos?: Express.Multer.File[];
      insuranceInvoice?: Express.Multer.File[];
      registrationCardImage?: Express.Multer.File[];
    },
  ) {
    return this.companyService.addCar(req.user?.id, dto, files);
  }

  @Get('cars/search')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.DRIVER, UserRole.USER)
  @UseGuards(JwtAuthGuard)
  searchCarsByCity(@Query('city') city: string) {
    return this.companyService.searchCarsByCity(city);
  }

  @Get('/cars')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard)
  getCarsByCompanyId(@Req() req: any) {
    return this.companyService.carsByCompany(req.user?.id);
  }

  @Get('/car/:carId')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.DRIVER, UserRole.USER)
  @UseGuards(JwtAuthGuard)
  getCarById(@Param('carId') carId: string) {
    return this.companyService.carById(carId);
  }

  @Patch('/car')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'vehiclePhotos', maxCount: 6 },
        { name: 'insuranceInvoice', maxCount: 1 },
        { name: 'registrationCardImage', maxCount: 1 },
      ],
      multerConfig('company-car'),
    ),
  )
  updateCar(
    @Req() req: any,
    @Body() dto: UpdateCompanyCarDto,
    @UploadedFiles()
    files: {
      vehiclePhotos?: Express.Multer.File[];
      insuranceInvoice?: Express.Multer.File[];
      registrationCardImage?: Express.Multer.File[];
    },
  ) {
    return this.companyService.updateCar(req.user?.id, dto.carId, dto, files);
  }
}

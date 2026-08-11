import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { multerConfig } from 'src/common/middlewares/multer';
import { FileInterceptor } from '@nestjs/platform-express';

import { UpdateProfileDto } from './dto/update-profile.dto';

import { RoleGuard } from '../auth/roles/roles.guard';
import { Roles } from 'src/modules/auth/roles/roles.decorator';

import { UserService } from './user.service';

@ApiTags('User')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/Profile')
  getMyProfile(@Req() req: any) {
    console.log(req.user);
    return this.userService.myProfile(req.user.id);
  }

  @Post('/profile')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateProfileDto })
  @UseInterceptors(FileInterceptor('avatar', multerConfig('profile')))
  updateProfile(
    @Req() req: any,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // console.log('dto ----------->', dto);
    // console.log('file ----------->', file);
    return this.userService.updateProfile(req.user.id, dto, file);
  }
}

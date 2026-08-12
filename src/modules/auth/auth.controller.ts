import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';

import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SuperAdminLoginDto } from './dto/superadmin-login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // @Post('/sendOtp')
  // sendOtp(@Body() dto: SendOtpDto) {
  //   return this.authService.sendOtp(dto);
  // }

  // @Post('/verifyOtp')
  // verifyOtp(@Body() dto: VerifyOtpDto) {
  //   return this.authService.verifyOtp(dto);
  // }

  // @Post('/resendOtp')
  // resendOtp(@Body() dto: ResendOtpDto) {
  //   return this.authService.resendOtp(dto);
  // }
}

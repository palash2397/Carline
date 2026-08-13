import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { generateOtp, getExpirationTime } from 'src/helpers/index';
import { Msg } from 'src/helpers/responseMsg';
import jwt from 'jsonwebtoken';

import { User, UserDocument } from 'src/modules/user/schema/user.schema';

import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { UserRegisterDto } from './dto/user-register.dto';

import { UserRole } from 'src/common/enums/user/role.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async userRegister(dto: UserRegisterDto) {
    try {
      const { firstName, lastName, phoneNumber, email, password } = dto;

      const existingUser = await this.userModel.findOne({
        $or: [{ email }, { phoneNumber }],
      });
      if (existingUser) {
        return new ApiResponse(400, {}, Msg.USER_EXISTS);
      }

      const otp = generateOtp();
      const otpExpiry = getExpirationTime();

      const newUser = await this.userModel.create({
        firstName,
        lastName,
        phoneNumber,
        email,
        password,
        otp,
        otpExpireAt: otpExpiry,
      });

      return new ApiResponse(
        200,
        {
          _id: newUser._id,
        },
        Msg.OTP_SENT,
      );
    } catch (error) {
      console.log('error while user registration', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { generateOtp, getExpirationTime } from 'src/helpers/index';
import { Msg } from 'src/helpers/responseMsg';

import jwt from 'jsonwebtoken';

import { User, UserDocument } from 'src/modules/user/schema/user.schema';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async sendOtp(dto: SendOtpDto) {
    try {
      const otp = '9999';
      const otpExpireAt = getExpirationTime();

      const userExists = await this.userModel.findOne({
        countryCode: dto.countryCode,
        phoneNumber: dto.phoneNumber,
      });

      // New user
      if (!userExists) {
        const user = await this.userModel.create({
          countryCode: dto.countryCode,
          phoneNumber: dto.phoneNumber,
          roles: dto.roles ? [dto.roles] : [],
          otp,
          otpExpireAt,
          isVerified: false,
          isProfileCompleted: false,
        });

        return new ApiResponse(200, {}, Msg.OTP_SENT);
      }

      // Existing user
      const user = await this.userModel.findOneAndUpdate(
        {
          countryCode: dto.countryCode,
          phoneNumber: dto.phoneNumber,
        },
        {
          $set: {
            otp,
            otpExpireAt,
          },

          $addToSet: {
            roles: dto.roles,
          },
        },
        {
          new: true,
        },
      );

      return new ApiResponse(200, {}, Msg.OTP_SENT);
    } catch (error) {
      console.log('error while sending otp', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async verifyOtp(dto: VerifyOtpDto) {
    try {
      const user = await this.userModel.findOne({
        phoneNumber: dto.phoneNumber,
      });

      if (!user) {
        return new ApiResponse(400, {}, Msg.USER_NOT_FOUND);
      }

      if (user.otp !== dto.otp) {
        return new ApiResponse(400, {}, Msg.OTP_INVALID);
      }

      if (!user.otpExpireAt || new Date() > user.otpExpireAt) {
        return new ApiResponse(400, {}, Msg.OTP_EXPIRED);
      }

      user.isVerified = true;
      user.otp = undefined;
      user.otpExpireAt = undefined;

      await user.save();

      const token = jwt.sign(
        {
          id: user._id.toString(),
          roles: user.roles,
          phoneNumber: user.phoneNumber,
        },
        process.env.JWT_SECRET!,
        {
          expiresIn: '10d',
        },
      );

      user.avatar = user.avatar
        ? `${process.env.BASE_URL}/api/v1/uploads/profile/${user.avatar}`
        : process.env.DEFAULT_IMAGE;

      return new ApiResponse(
        200,
        {
          token,
          user,
        },
        Msg.OTP_VERIFIED,
      );
    } catch (error) {
      console.log('error while verifying otp', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async resendOtp(dto: ResendOtpDto) {
    try {
      const userExists = await this.userModel.findOne({
        phoneNumber: dto.phoneNumber,
        countryCode: dto.countryCode,
      });

      if (!userExists) {
        return new ApiResponse(400, {}, Msg.USER_NOT_FOUND);
      }

      const otp = '9999';
      const otpExpireAt = getExpirationTime();

      await this.userModel.findOneAndUpdate(
        {
          phoneNumber: dto.phoneNumber,
        },
        {
          otp,
          otpExpireAt,
        },
        {
          new: true,
        },
      );

      return new ApiResponse(200, {}, Msg.OTP_RESENT);
    } catch (error) {
      console.log('error while resending otp', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

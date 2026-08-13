import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import jwt from 'jsonwebtoken';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { generateOtp, getExpirationTime } from 'src/helpers/index';
import { Msg } from 'src/helpers/responseMsg';

import { User, UserDocument } from 'src/modules/user/schema/user.schema';
import { UserRegisterDto } from './dto/user-register.dto';

import { getOtpEmailTemplate } from 'src/modules/mail/template/otp.template';
import { MailService } from 'src/modules/mail/mail.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailService: MailService,
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

      await this.mailService.sendEmail(
        dto.email,
        'OTP Verification',
        `Your OTP is ${otp}`,
        getOtpEmailTemplate(otp, dto.firstName),
      );

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

  async verifyOtp(dto: VerifyOtpDto) {
    try {
      const checkUser = await this.userModel.findOne({ email: dto.email });
      if (!checkUser) {
        return new ApiResponse(400, {}, Msg.USER_NOT_FOUND);
      }

      if (checkUser.isVerified) {
        return new ApiResponse(400, {}, Msg.USER_ALREADY_VERIFIED);
      }

      if (!checkUser.otp || !checkUser.otpExpireAt) {
        return new ApiResponse(400, {}, Msg.OTP_INVALID);
      }

      if (checkUser.otp !== dto.otp || new Date() > checkUser.otpExpireAt) {
        return new ApiResponse(400, {}, Msg.OTP_INVALID);
      }

      checkUser.isVerified = true;
      checkUser.otp = undefined;
      checkUser.otpExpireAt = undefined;

      await checkUser.save();

      return new ApiResponse(200, {}, Msg.OTP_VERIFIED);
    } catch (error) {
      console.log(`error while verifying the otp`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

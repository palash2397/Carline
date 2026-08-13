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
}

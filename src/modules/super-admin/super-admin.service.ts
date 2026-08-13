import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from '../user/schema/user.schema';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';

import jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

import { DriverStatusDto } from './dto/driver-status.dto';

import { UserRole } from 'src/common/enums/user/role.enum';
import { VerificationStatus } from 'src/common/enums/driver/verification-status.enum';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // async login(dto: SuperAdminLoginDto) {
  //   try {
  //     const user = await this.userModel.findOne({
  //       email: dto.email,
  //       roles: { $in: [UserRole.SUPERADMIN] },
  //     });
  //     console.log('user', user);

  //     if (!user) {
  //       return new ApiResponse(400, {}, Msg.USER_NOT_FOUND);
  //     }

  //     if (!user.password) {
  //       return new ApiResponse(400, {}, Msg.INVALID_CREDENTIALS);
  //     }

  //     const isPasswordValid = await bcrypt.compare(dto.password, user.password);

  //     if (!isPasswordValid) {
  //       return new ApiResponse(400, {}, Msg.INVALID_CREDENTIALS);
  //     }

  //     const token = jwt.sign(
  //       {
  //         id: user._id.toString(),
  //         roles: user.roles,
  //         email: user.email,
  //       },
  //       process.env.JWT_SECRET!,
  //       {
  //         expiresIn: '10d',
  //       },
  //     );

  //     user.avatar = user.avatar
  //       ? `${process.env.BASE_URL}/api/v1/uploads/profile/${user.avatar}`
  //       : process.env.DEFAULT_IMAGE;

  //     const userData = {
  //       _id: user._id,
  //       firstName: user.firstName,
  //       lastName: user.lastName,
  //       phoneNumber: user.phoneNumber,
  //       email: user.email,
  //       roles: user.roles,
  //       avatar: user.avatar,
  //       gender: user.gender,
  //       token,
  //     };

  //     return new ApiResponse(
  //       200,
  //       {
  //         userData,
  //       },
  //       Msg.LOGIN_SUCCESS,
  //     );
  //   } catch (error) {
  //     console.log('error while super admin login', error);
  //     return new ApiResponse(500, {}, Msg.SERVER_ERROR);
  //   }
  // }
}

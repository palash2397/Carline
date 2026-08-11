import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ApiResponse } from 'src/helpers/ApiResponse';
import {
  generateOtp,
  getExpirationTime,
  deleteOldFile,
} from 'src/helpers/index';

import { UpdateProfileDto } from './dto/update-profile.dto';
import { Msg } from 'src/helpers/responseMsg';
import { User, UserDocument } from './schema/user.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async myProfile(userId: string) {
    try {
      const user = await this.userModel
        .findById(userId)
        .select('-otp -otpExpireAt')
        .lean();

      if (!user) {
        return new ApiResponse(400, {}, Msg.USER_NOT_FOUND);
      }

      user.avatar = user.avatar
        ? `${process.env.BASE_URL}/api/v1/uploads/profile/${user.avatar}`
        : process.env.DEFAULT_IMAGE;

      return new ApiResponse(200, user, Msg.USER_FETCHED);
    } catch (error) {
      console.log('error while getting my profile', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ) {
    try {
      const user = await this.userModel.findOne({ _id: userId });
      if (!user) {
        return new ApiResponse(404, {}, Msg.USER_NOT_FOUND);
      }

      const updatedUser = await this.userModel.findOneAndUpdate(
        { _id: user._id },
        { ...dto, user: user._id },
        { new: true, upsert: true },
      );

      if (!updatedUser) {
        return new ApiResponse(404, {}, Msg.USER_NOT_FOUND);
      }

      updatedUser.isProfileCompleted = true;
      await updatedUser.save();

      console.log(`updated user ----------->`, updatedUser);

      if (file) {
        if (user.avatar) {
          deleteOldFile('user', user.avatar);
        }

        updatedUser.avatar = file.filename;
        await updatedUser.save();
      }

      updatedUser.avatar = updatedUser.avatar
        ? `${process.env.BASE_URL}/api/v1/uploads/profile/${updatedUser.avatar}`
        : process.env.DEFAULT_IMAGE;

      return new ApiResponse(200, updatedUser, Msg.USER_UPDATED);
    } catch (error) {
      console.log('error while updating profile', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

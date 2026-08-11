import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from '../user/schema/user.schema';
import { Driver, DriverDocument } from '../driver/schema/driver.schema';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';

import jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

import { SuperAdminLoginDto } from '../auth/dto/superadmin-login.dto';
import { DriverStatusDto } from './dto/driver-status.dto';

import { UserRole } from 'src/common/enums/user/role.enum';
import { VerificationStatus } from 'src/common/enums/driver/verification-status.enum';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Driver.name)
    private readonly driverModel: Model<DriverDocument>,
  ) {}

  async login(dto: SuperAdminLoginDto) {
    try {
      const user = await this.userModel.findOne({
        email: dto.email,
        roles: { $in: [UserRole.SUPERADMIN] },
      });
      console.log('user', user);

      if (!user) {
        return new ApiResponse(400, {}, Msg.USER_NOT_FOUND);
      }

      if (!user.password) {
        return new ApiResponse(400, {}, Msg.INVALID_CREDENTIALS);
      }

      const isPasswordValid = await bcrypt.compare(dto.password, user.password);

      if (!isPasswordValid) {
        return new ApiResponse(400, {}, Msg.INVALID_CREDENTIALS);
      }

      const token = jwt.sign(
        {
          id: user._id.toString(),
          roles: user.roles,
          email: user.email,
        },
        process.env.JWT_SECRET!,
        {
          expiresIn: '10d',
        },
      );

      user.avatar = user.avatar
        ? `${process.env.BASE_URL}/api/v1/uploads/profile/${user.avatar}`
        : process.env.DEFAULT_IMAGE;

      const userData = {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        countryCode: user.countryCode,
        phoneNumber: user.phoneNumber,
        email: user.email,
        roles: user.roles,
        avatar: user.avatar,
        gender: user.gender,
        token,
      };

      return new ApiResponse(
        200,
        {
          userData,
        },
        Msg.LOGIN_SUCCESS,
      );
    } catch (error) {
      console.log('error while super admin login', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async allDrivers() {
    try {
      const drivers = await this.driverModel
        .find()
        .populate('user', '-password -otp -otpExpireAt')
        .lean();

      if (!drivers || drivers.length == 0) {
        return new ApiResponse(404, {}, Msg.DATA_NOT_FOUND);
      }

      const baseUrl = process.env.BASE_URL;
      const formattedDrivers = drivers.map((driver: any) => {
        if (driver.user && driver.user.avatar) {
          driver.user.avatar = `${baseUrl}/api/v1/uploads/profile/${driver.user.avatar}`;
        }

        const formatDriverImage = (fileName?: string) =>
          fileName ? `${baseUrl}/api/v1/uploads/driver/${fileName}` : undefined;

        driver.nationalIdFront = formatDriverImage(driver.nationalIdFront);
        driver.nationalIdBack = formatDriverImage(driver.nationalIdBack);
        driver.driverLicenseFront = formatDriverImage(
          driver.driverLicenseFront,
        );
        driver.driverLicenseBack = formatDriverImage(driver.driverLicenseBack);
        driver.vehicleRegistrationFront = formatDriverImage(
          driver.vehicleRegistrationFront,
        );
        driver.vehicleRegistrationBack = formatDriverImage(
          driver.vehicleRegistrationBack,
        );

        if (driver.vehiclePhotos && driver.vehiclePhotos.length > 0) {
          driver.vehiclePhotos = driver.vehiclePhotos.map(
            (photo: string) => formatDriverImage(photo) as string,
          );
        }

        return driver;
      });

      return new ApiResponse(
        200,
        {
          drivers: formattedDrivers,
        },
        Msg.DRIVERS_FETCHED,
      );
    } catch (error) {
      console.log('error while fetching drivers', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async driverById(driverId: string) {
    try {
      const driver = await this.driverModel
        .findById(driverId)
        .populate('user', '-password -otp -otpExpireAt')
        .lean();

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const baseUrl = process.env.BASE_URL;
      if (driver.user && (driver.user as any).avatar) {
        (driver.user as any).avatar =
          `${baseUrl}/api/v1/uploads/profile/${(driver.user as any).avatar}`;
      }

      const formatDriverImage = (fileName?: string) =>
        fileName ? `${baseUrl}/api/v1/uploads/driver/${fileName}` : undefined;

      driver.nationalIdFront = formatDriverImage(driver.nationalIdFront);
      driver.nationalIdBack = formatDriverImage(driver.nationalIdBack);
      driver.driverLicenseFront = formatDriverImage(driver.driverLicenseFront);
      driver.driverLicenseBack = formatDriverImage(driver.driverLicenseBack);
      driver.vehicleRegistrationFront = formatDriverImage(
        driver.vehicleRegistrationFront,
      );
      driver.vehicleRegistrationBack = formatDriverImage(
        driver.vehicleRegistrationBack,
      );

      if (driver.vehiclePhotos && driver.vehiclePhotos.length > 0) {
        driver.vehiclePhotos = driver.vehiclePhotos.map(
          (photo: string) => formatDriverImage(photo) as string,
        );
      }

      return new ApiResponse(
        200,
        {
          driver,
        },
        Msg.DRIVERS_FETCHED,
      );
    } catch (error) {
      console.log('error while fetching driver by id', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async approveOrRejectDriver(dto: DriverStatusDto) {
    try {
      const { driverId, status } = dto;

      // const user = await this.userModel.findById(driverId);
      // if (!user) {
      //   return new ApiResponse(404, {}, Msg.USER_NOT_FOUND);
      // }

      const driver = await this.driverModel.findOne({ _id: driverId });
      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      driver.verificationStatus = status;
      await driver.save();

      return new ApiResponse(
        200,
        { driver },
        status === VerificationStatus.APPROVED
          ? Msg.DRIVER_VERIFIED
          : Msg.DRIVER_REJECTED,
      );
    } catch (error) {
      console.log(`error while changing the driver status`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

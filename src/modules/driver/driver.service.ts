import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { deleteOldFile } from 'src/helpers/index';

import { Driver, DriverDocument } from './schema/driver.schema';
import { User, UserDocument } from 'src/modules/user/schema/user.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';

import { UpdateDriverBasicDetailsDto } from './dto/update-driver-basic-details.dto';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';

import { RideStatus } from 'src/common/enums/ride/ride-enum';
import { SocketService } from '../socket/socket.service';

@Injectable()
export class DriverService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    private readonly socketService: SocketService,
  ) {}

  async myProfile(userId: string) {
    try {
      const driver = await this.driverModel
        .findOne({ user: userId })
        .populate(
          'user',
          'firstName lastName email avatar phoneNumber countryCode',
        )
        .lean();

      if (!driver) {
        return new ApiResponse(404, {}, 'Driver profile not found');
      }

      const baseUrl = process.env.BASE_URL;

      // Format User avatar
      if (driver.user) {
        const user = driver.user as any;
        user.avatar = user.avatar
          ? `${baseUrl}/api/v1/uploads/profile/${user.avatar}`
          : process.env.DEFAULT_IMAGE;
      }

      // Format Driver documents
      const formatUrl = (fileName?: string) =>
        fileName ? `${baseUrl}/api/v1/uploads/driver/${fileName}` : undefined;

      driver.nationalIdFront = formatUrl(driver.nationalIdFront);
      driver.nationalIdBack = formatUrl(driver.nationalIdBack);
      driver.driverLicenseFront = formatUrl(driver.driverLicenseFront);
      driver.driverLicenseBack = formatUrl(driver.driverLicenseBack);
      driver.vehicleRegistrationFront = formatUrl(
        driver.vehicleRegistrationFront,
      );
      driver.vehicleRegistrationBack = formatUrl(
        driver.vehicleRegistrationBack,
      );

      if (driver.vehiclePhotos && driver.vehiclePhotos.length > 0) {
        driver.vehiclePhotos = driver.vehiclePhotos.map(
          (photo) => `${baseUrl}/api/v1/uploads/driver/${photo}`,
        );
      }

      return new ApiResponse(200, driver, Msg.DRIVER_FETCHED);
    } catch (error) {
      console.log('Error getting driver profile:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async toggleStatus(userId: string) {
    try {
      const driver = await this.driverModel.findOne({ user: userId });
      if (!driver) {
        return new ApiResponse(404, {}, 'Driver profile not found');
      }

      driver.isOnline = !driver.isOnline;
      await driver.save();

      const msg = driver.isOnline ? 'online' : 'offline';

      return new ApiResponse(
        200,
        { isOnline: driver.isOnline },
        `Driver status marked ${msg}`,
      );
    } catch (error) {
      console.log('Error toggling driver status:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateBasicDetails(
    userId: string,
    dto: UpdateDriverBasicDetailsDto,
    file?: Express.Multer.File,
  ) {
    try {
      const { firstName, lastName, email, gender, ...driverDto } = dto;

      const user = await this.userModel.findOne({ _id: userId });
      if (!user) {
        return new ApiResponse(404, {}, Msg.USER_NOT_FOUND);
      }

      // Update User profile
      const userUpdatePayload: any = {};
      if (firstName) userUpdatePayload.firstName = firstName;
      if (lastName) userUpdatePayload.lastName = lastName;
      if (email) userUpdatePayload.email = email;
      if (gender) userUpdatePayload.gender = gender;

      const updatedUser = await this.userModel.findOneAndUpdate(
        { _id: userId },
        userUpdatePayload,
        { new: true },
      );

      if (!updatedUser) {
        return new ApiResponse(400, {}, Msg.SERVER_ERROR);
      }

      if (file) {
        if (user.avatar) {
          deleteOldFile('user', user.avatar);
        }
        updatedUser.avatar = file.filename;
        await updatedUser.save();
      }

      const updatedDriver = await this.driverModel.findOneAndUpdate(
        { user: userId },
        { ...driverDto, user: userId },
        { new: true, upsert: true },
      );

      if (!updatedDriver) {
        return new ApiResponse(400, {}, Msg.SERVER_ERROR);
      }

      return new ApiResponse(200, updatedDriver, Msg.DRIVER_UPDATED);
    } catch (error) {
      console.log('Error updating driver basic details:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateDocuments(userId: string, files?: any) {
    try {
      const user = await this.userModel.findOne({ _id: userId });
      if (!user) {
        return new ApiResponse(404, {}, Msg.USER_NOT_FOUND);
      }

      const driver = await this.driverModel.findOne({ user: userId });

      const updatedDriver = await this.driverModel.findOneAndUpdate(
        { user: userId },
        { user: userId },
        { new: true, upsert: true },
      );

      if (!updatedDriver) {
        return new ApiResponse(400, {}, Msg.SERVER_ERROR);
      }

      if (files) {
        if (files.nationalIdFront) {
          if (driver && driver.nationalIdFront) {
            deleteOldFile('driver', driver.nationalIdFront);
          }
          updatedDriver.nationalIdFront = files.nationalIdFront[0].filename;
        }

        if (files.nationalIdBack) {
          if (driver && driver.nationalIdBack) {
            deleteOldFile('driver', driver.nationalIdBack);
          }
          updatedDriver.nationalIdBack = files.nationalIdBack[0].filename;
        }

        if (files.driverLicenseFront) {
          if (driver && driver.driverLicenseFront) {
            deleteOldFile('driver', driver.driverLicenseFront);
          }
          updatedDriver.driverLicenseFront =
            files.driverLicenseFront[0].filename;
        }

        if (files.driverLicenseBack) {
          if (driver && driver.driverLicenseBack) {
            deleteOldFile('driver', driver.driverLicenseBack);
          }
          updatedDriver.driverLicenseBack = files.driverLicenseBack[0].filename;
        }

        if (files.vehicleRegistrationFront) {
          if (driver && driver.vehicleRegistrationFront) {
            deleteOldFile('driver', driver.vehicleRegistrationFront);
          }
          updatedDriver.vehicleRegistrationFront =
            files.vehicleRegistrationFront[0].filename;
        }

        if (files.vehicleRegistrationBack) {
          if (driver && driver.vehicleRegistrationBack) {
            deleteOldFile('driver', driver.vehicleRegistrationBack);
          }
          updatedDriver.vehicleRegistrationBack =
            files.vehicleRegistrationBack[0].filename;
        }

        if (files.vehiclePhotos) {
          if (
            driver &&
            driver.vehiclePhotos &&
            driver.vehiclePhotos.length > 0
          ) {
            driver.vehiclePhotos.forEach((photo) => {
              deleteOldFile('driver', photo);
            });
          }
          updatedDriver.vehiclePhotos = files.vehiclePhotos.map(
            (f: any) => f.filename,
          );
        }

        await updatedDriver.save();
      }

      const baseUrl = process.env.BASE_URL;

      updatedDriver.nationalIdFront = updatedDriver.nationalIdFront
        ? `${baseUrl}/api/v1/uploads/driver/${updatedDriver.nationalIdFront}`
        : undefined;

      updatedDriver.nationalIdBack = updatedDriver.nationalIdBack
        ? `${baseUrl}/api/v1/uploads/driver/${updatedDriver.nationalIdBack}`
        : undefined;

      updatedDriver.driverLicenseFront = updatedDriver.driverLicenseFront
        ? `${baseUrl}/api/v1/uploads/driver/${updatedDriver.driverLicenseFront}`
        : undefined;

      updatedDriver.driverLicenseBack = updatedDriver.driverLicenseBack
        ? `${baseUrl}/api/v1/uploads/driver/${updatedDriver.driverLicenseBack}`
        : undefined;

      updatedDriver.vehicleRegistrationFront =
        updatedDriver.vehicleRegistrationFront
          ? `${baseUrl}/api/v1/uploads/driver/${updatedDriver.vehicleRegistrationFront}`
          : undefined;

      updatedDriver.vehicleRegistrationBack =
        updatedDriver.vehicleRegistrationBack
          ? `${baseUrl}/api/v1/uploads/driver/${updatedDriver.vehicleRegistrationBack}`
          : undefined;

      if (
        updatedDriver.vehiclePhotos &&
        updatedDriver.vehiclePhotos.length > 0
      ) {
        updatedDriver.vehiclePhotos = updatedDriver.vehiclePhotos.map(
          (photo) => `${baseUrl}/api/v1/uploads/driver/${photo}`,
        );
      }

      user.isProfileCompleted = true;
      await user.save();

      return new ApiResponse(200, updatedDriver, Msg.DRIVER_UPDATED);
    } catch (error) {
      console.log('Error updating driver documents:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateDriverLocation(userId: string, dto: UpdateDriverLocationDto) {
    try {
      const driver = await this.driverModel.findOneAndUpdate(
        {
          user: userId,
          isOnline: true,
        },
        {
          currentLocation: {
            type: 'Point',
            coordinates: [dto.longitude, dto.latitude],
          },
        },
        {
          new: true,
        },
      );

      if (!driver) {
        return {
          success: false,
          message: Msg.DRIVER_NOT_ONLINE,
        };
      }

      const ride = await this.rideModel.findOne({
        driver: driver._id,
        status: {
          $in: [
            RideStatus.DRIVER_FOUND,
            RideStatus.DRIVER_ARRIVED,
            RideStatus.ONGOING,
          ],
        },
      });

      console.log('Ride User:', ride?.user.toString());
      console.log('Driver User:', userId);
      console.log('Ride Id:', ride?._id);

      if (ride) {
        this.socketService.emitToUser(
          ride.user.toString(),
          'driverLocationUpdated',
          {
            rideId: ride._id,
            latitude: dto.latitude,
            longitude: dto.longitude,
          },
        );
      } else {
        console.log('NO ACTIVE RIDE');
      }

      return {
        success: true,
        message: Msg.LOCATION_UPDATED,
      };
    } catch (error) {
      console.log('error while updating driver location', error);

      return {
        success: false,
        message: Msg.SERVER_ERROR,
      };
    }
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Driver, DriverDocument } from './schema/driver.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';

@Injectable()
export class DriverService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
  ) {}

  async getDrivers(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      const searchFilter: any = {};
      if (query.search) {
        searchFilter.$or = [
          { driverName: { $regex: query.search, $options: 'i' } },
          { mobileNumber: { $regex: query.search, $options: 'i' } },
          { assignQueue: { $regex: query.search, $options: 'i' } },
        ];
      }

      if (query.batch) {
        searchFilter.batch = parseInt(query.batch);
      }

      const total = await this.driverModel.countDocuments(searchFilter);
      const data = await this.driverModel
        .find(searchFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      return new ApiResponse(
        200,
        { data, total, page, limit },
        Msg.DATA_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async createDriver(dto: any) {
    try {
      const lastDriver = await this.driverModel
        .findOne()
        .sort({ driverId: -1 });
      const newDriverId =
        lastDriver && lastDriver.driverId ? lastDriver.driverId + 1 : 1;

      const newDriver = new this.driverModel({
        ...dto,
        driverId: newDriverId,
      });

      await newDriver.save();

      return new ApiResponse(201, newDriver, 'Driver created successfully');
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateDriver(id: string, dto: any) {
    try {
      const updatedDriver = await this.driverModel.findByIdAndUpdate(
        id,
        { $set: dto },
        { new: true, runValidators: true },
      );

      if (!updatedDriver) {
        return new ApiResponse(404, {}, 'Driver not found');
      }

      return new ApiResponse(200, updatedDriver, 'Driver updated successfully');
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

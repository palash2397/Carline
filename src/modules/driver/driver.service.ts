import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Driver, DriverDocument } from './schema/driver.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { RideStatus } from 'src/common/enums/ride/ride-enum';
import { PaymentType } from 'src/common/enums/payment/payment-type';

@Injectable()
export class DriverService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
  ) {}

  private async calculateDriverEarnings(driver: DriverDocument) {
    const numberDigits = (driver.mobileNumber || '').replace(/\D/g, '');
    const driverMatchConditions: any[] = [
      { driverId: driver._id.toString() },
      { driverNumber: driver.mobileNumber },
    ];

    if (numberDigits && numberDigits.length >= 7) {
      driverMatchConditions.push({
        driverNumber: { $regex: numberDigits, $options: 'i' },
      });
    }

    if (driver.driverName) {
      driverMatchConditions.push({
        driverName: { $regex: `^${driver.driverName.trim()}$`, $options: 'i' },
      });
    }

    // Find completed rides
    const completedRides = await this.rideModel.find({
      $or: driverMatchConditions,
      rideStatus: { $in: [RideStatus.COMPLETED, 'COMPLETED'] },
    });

    let earningsWithCash = 0;
    let earningsWithoutCash = 0;

    for (const ride of completedRides) {
      const fare = ride.rideAmount || 0;
      if (
        ride.paymentType === PaymentType.CASH ||
        ride.paymentType === 'CASH'
      ) {
        earningsWithCash += fare;
      } else {
        earningsWithoutCash += fare;
      }
    }

    const totalEarnings = earningsWithCash + earningsWithoutCash;

    // Check ongoing ride
    const activeRide = await this.rideModel.findOne({
      $or: driverMatchConditions,
      rideStatus: {
        $in: [
          RideStatus.ACCEPTED,
          RideStatus.STARTED,
          RideStatus.PAYMENT_PENDING,
          'ACCEPTED',
          'STARTED',
          'PAYMENT_PENDING',
        ],
      },
    });

    const ongoingRides = activeRide ? 'YES' : 'NO';

    // Get latest completed trip timestamp
    const latestTrip = completedRides.sort(
      (a, b) =>
        new Date(b.rideCompleteDateTime || b['updatedAt'] || 0).getTime() -
        new Date(a.rideCompleteDateTime || a['updatedAt'] || 0).getTime(),
    )[0];

    const lastTripTaken = latestTrip
      ? latestTrip.rideCompleteDateTime || latestTrip['updatedAt']
      : driver.lastTripTaken || null;

    // Update driver document fields in DB
    driver.earningsWithCash = Number(earningsWithCash.toFixed(2));
    driver.earningsWithoutCash = Number(earningsWithoutCash.toFixed(2));
    driver.totalEarnings = Number(totalEarnings.toFixed(2));
    driver.ongoingRides = ongoingRides;
    if (lastTripTaken) {
      driver.lastTripTaken = new Date(lastTripTaken);
    }
    await driver.save();

    return {
      earningsWithCash: Number(earningsWithCash.toFixed(2)),
      earningsWithoutCash: Number(earningsWithoutCash.toFixed(2)),
      totalEarnings: Number(totalEarnings.toFixed(2)),
      ongoingRides,
      lastTripTaken,
    };
  }

  async getDriverById(id: string) {
    try {
      let driver: DriverDocument | null = null;
      if (isValidObjectId(id)) {
        driver = await this.driverModel.findById(id);
      }
      if (!driver) {
        driver = await this.driverModel.findOne({
          $or: [{ mobileNumber: id }, { driverId: parseInt(id) || 0 }],
        });
      }

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const financialSummary = await this.calculateDriverEarnings(driver);

      const responseData = {
        ...driver.toObject(),
        financialSummary,
      };

      return new ApiResponse(200, responseData, Msg.DRIVER_FETCHED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getDriverEarningsSummary(id: string) {
    try {
      const result = await this.getDriverById(id);
      if (result.statusCode !== 200) {
        return result;
      }
      return new ApiResponse(
        200,
        result.data.financialSummary,
        Msg.DATA_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

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
      const drivers = await this.driverModel
        .find(searchFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Dynamically calculate live earnings for all drivers in list
      const data = await Promise.all(
        drivers.map(async (d) => {
          await this.calculateDriverEarnings(d);
          return d.toObject();
        }),
      );

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

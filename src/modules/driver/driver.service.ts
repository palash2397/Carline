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

    // Update driver document fields in DB if not manually set by admin
    if (!driver.isEarningsManuallySet) {
      driver.earningsWithCash = Number(earningsWithCash.toFixed(2));
      driver.earningsWithoutCash = Number(earningsWithoutCash.toFixed(2));
      driver.totalEarnings = Number(totalEarnings.toFixed(2));
    }
    driver.ongoingRides = ongoingRides;
    if (lastTripTaken) {
      driver.lastTripTaken = new Date(lastTripTaken);
    }
    await driver.save();

    return {
      earningsWithCash: driver.earningsWithCash,
      earningsWithoutCash: driver.earningsWithoutCash,
      totalEarnings: driver.totalEarnings,
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

  async syncAllDriverEarnings() {
    try {
      const drivers = await this.driverModel.find();
      for (const d of drivers) {
        await this.calculateDriverEarnings(d);
      }
      return new ApiResponse(
        200,
        { syncedCount: drivers.length },
        'Driver earnings synchronized successfully',
      );
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

      const [total, data] = await Promise.all([
        this.driverModel.countDocuments(searchFilter),
        this.driverModel
          .find(searchFilter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
      ]);

      const formattedData = data.map((d: any) => {
        const withCash =
          d.earningsWithCash !== undefined && d.earningsWithCash !== null
            ? Number(d.earningsWithCash)
            : 0;
        const withoutCash =
          d.earningsWithoutCash !== undefined && d.earningsWithoutCash !== null
            ? Number(d.earningsWithoutCash)
            : 0;
        const totalEarn =
          d.totalEarnings !== undefined && d.totalEarnings !== null
            ? Number(d.totalEarnings)
            : Number((withCash + withoutCash).toFixed(2));

        return {
          ...d,
          earningsWithCash: withCash,
          earningsWithoutCash: withoutCash,
          totalEarnings: totalEarn,
          financialSummary: {
            earningsWithCash: withCash,
            earningsWithoutCash: withoutCash,
            totalEarnings: totalEarn,
            ongoingRides: d.ongoingRides || 'NO',
            lastTripTaken: d.lastTripTaken || null,
          },
        };
      });

      return new ApiResponse(
        200,
        { data: formattedData, total, page, limit },
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
      if (
        dto.earningsWithCash !== undefined ||
        dto.earningsWithoutCash !== undefined ||
        dto.totalEarnings !== undefined
      ) {
        dto.isEarningsManuallySet = true;
      }

      if (
        (dto.earningsWithCash !== undefined ||
          dto.earningsWithoutCash !== undefined) &&
        dto.totalEarnings === undefined
      ) {
        let existingDriver: DriverDocument | null = null;
        if (isValidObjectId(id)) {
          existingDriver = await this.driverModel.findById(id);
        } else {
          existingDriver = await this.driverModel.findOne({
            $or: [{ driverId: parseInt(id) || 0 }, { mobileNumber: id }],
          });
        }
        const withCash =
          dto.earningsWithCash !== undefined
            ? dto.earningsWithCash
            : existingDriver?.earningsWithCash || 0;
        const withoutCash =
          dto.earningsWithoutCash !== undefined
            ? dto.earningsWithoutCash
            : existingDriver?.earningsWithoutCash || 0;
        dto.totalEarnings = Number((withCash + withoutCash).toFixed(2));
      }

      let updatedDriver: any = null;
      if (isValidObjectId(id)) {
        updatedDriver = await this.driverModel.findByIdAndUpdate(
          id,
          { $set: dto },
          { new: true, runValidators: true },
        );
      } else {
        updatedDriver = await this.driverModel.findOneAndUpdate(
          {
            $or: [{ driverId: parseInt(id) || 0 }, { mobileNumber: id }],
          },
          { $set: dto },
          { new: true, runValidators: true },
        );
      }

      if (!updatedDriver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      return new ApiResponse(200, updatedDriver, 'Driver updated successfully');
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateDriverEarnings(dto: any) {
    try {
      const driverIdentifier = dto.driverId || dto.id || dto._id;
      if (!driverIdentifier) {
        return new ApiResponse(400, {}, 'driverId is required');
      }

      let driver: DriverDocument | null = null;
      if (isValidObjectId(driverIdentifier)) {
        driver = await this.driverModel.findById(driverIdentifier);
      }
      if (!driver) {
        driver = await this.driverModel.findOne({
          $or: [
            { driverId: parseInt(driverIdentifier) || 0 },
            { mobileNumber: String(driverIdentifier) },
          ],
        });
      }

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      // Handle aliases for with-cash earnings
      const inputWithCash =
        dto.earningsWithCash !== undefined
          ? dto.earningsWithCash
          : dto.cashEarnings !== undefined
            ? dto.cashEarnings
            : dto.cash;

      // Handle aliases for without-cash earnings
      const inputWithoutCash =
        dto.earningsWithoutCash !== undefined
          ? dto.earningsWithoutCash
          : dto.cardEarnings !== undefined
            ? dto.cardEarnings
            : dto.nonCashEarnings !== undefined
              ? dto.nonCashEarnings
              : dto.card;

      // Handle aliases for total earnings
      const inputTotal =
        dto.totalEarnings !== undefined
          ? dto.totalEarnings
          : dto.earnings !== undefined
            ? dto.earnings
            : dto.totalEarning;

      if (inputWithCash !== undefined && inputWithCash !== null) {
        driver.earningsWithCash = Number(inputWithCash);
      }

      if (inputWithoutCash !== undefined && inputWithoutCash !== null) {
        driver.earningsWithoutCash = Number(inputWithoutCash);
      }

      if (inputTotal !== undefined && inputTotal !== null) {
        driver.totalEarnings = Number(inputTotal);
      } else if (
        inputWithCash !== undefined ||
        inputWithoutCash !== undefined
      ) {
        driver.totalEarnings = Number(
          (
            (driver.earningsWithCash || 0) + (driver.earningsWithoutCash || 0)
          ).toFixed(2),
        );
      }

      driver.isEarningsManuallySet = true;
      await driver.save();

      const responsePayload = {
        _id: driver._id,
        driverId: driver.driverId,
        driverName: driver.driverName,
        earningsWithCash: driver.earningsWithCash,
        earningsWithoutCash: driver.earningsWithoutCash,
        totalEarnings: driver.totalEarnings,
        financialSummary: {
          earningsWithCash: driver.earningsWithCash,
          earningsWithoutCash: driver.earningsWithoutCash,
          totalEarnings: driver.totalEarnings,
          ongoingRides: driver.ongoingRides || 'NO',
          lastTripTaken: driver.lastTripTaken || null,
        },
      };

      return new ApiResponse(200, responsePayload, Msg.DATA_UPDATED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Driver, DriverDocument } from './schema/driver.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { RideStatus } from 'src/common/enums/ride/ride-enum';
import { PaymentType } from 'src/common/enums/payment/payment-type';

import { UpdateDriverBatchDto } from './dto/update-batch.dto';
import { BulkUpdateDriverBatchDto } from './dto/bulk-update-batch.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriverSettlementDto } from './dto/driver-settlement.dto';
import {
  DriverEarningsAudit,
  DriverEarningsAuditDocument,
} from './schema/driver-earnings-audit.schema';
import { UserRole } from 'src/common/enums/user/role.enum';

@Injectable()
export class DriverService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(DriverEarningsAudit.name)
    private driverEarningsAuditModel: Model<DriverEarningsAuditDocument>,
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

  async updateDriver(dto: UpdateDriverDto) {
    try {
      const existingDriver = await this.driverModel.findById(dto.id);

      if (!existingDriver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const updatedDriver = await this.driverModel.findByIdAndUpdate(
        existingDriver._id,
        { $set: dto },
        { new: true, runValidators: true },
      );

      return new ApiResponse(200, updatedDriver, Msg.DRIVER_UPDATED);
    } catch (error) {
      console.log(`Error while updating driver:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateDriverEarnings(dto: any) {
    try {
      const driver = await this.driverModel.findById(dto.driverId);
      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const previousEarningsWithCash = Number(driver.earningsWithCash || 0);
      const previousEarningsWithoutCash = Number(
        driver.earningsWithoutCash || 0,
      );
      const previousTotalEarnings = Number(driver.totalEarnings || 0);

      const inputWithCash =
        dto.earningsWithCash !== undefined
          ? dto.earningsWithCash
          : dto.cashEarnings !== undefined
            ? dto.cashEarnings
            : dto.cash;

      const inputWithoutCash =
        dto.earningsWithoutCash !== undefined
          ? dto.earningsWithoutCash
          : dto.cardEarnings !== undefined
            ? dto.cardEarnings
            : dto.nonCashEarnings !== undefined
              ? dto.nonCashEarnings
              : dto.card;

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

      const auditLog = new this.driverEarningsAuditModel({
        driverObjectId: driver._id.toString(),
        driverId: driver.driverId,
        driverName: driver.driverName,
        mobileNumber: driver.mobileNumber,
        actionType:
          dto.settlementType === 'SETTLEMENT' ? 'SETTLEMENT' : 'ADJUSTMENT',
        previousEarningsWithCash,
        newEarningsWithCash: driver.earningsWithCash,
        previousEarningsWithoutCash,
        newEarningsWithoutCash: driver.earningsWithoutCash,
        previousTotalEarnings,
        newTotalEarnings: driver.totalEarnings,
        cashDifference: Number(
          (driver.earningsWithCash - previousEarningsWithCash).toFixed(2),
        ),
        nonCashDifference: Number(
          (driver.earningsWithoutCash - previousEarningsWithoutCash).toFixed(2),
        ),
        totalDifference: Number(
          (driver.totalEarnings - previousTotalEarnings).toFixed(2),
        ),
        settlementAmount: dto.amount || dto.settlementAmount || 0,
        settlementMethod: dto.paymentMethod || dto.settlementMethod || null,
        note: dto.note || 'Manual earnings adjustment by admin',
        updatedBy: UserRole.ADMIN,
      });
      await auditLog.save();

      const responsePayload = {
        _id: driver._id,
        driverId: driver.driverId,
        driverName: driver.driverName,
        earningsWithCash: driver.earningsWithCash,
        earningsWithoutCash: driver.earningsWithoutCash,
        totalEarnings: driver.totalEarnings,
        auditId: auditLog._id,
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
      console.log(`Error while updating driver earnings:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async processDriverSettlement(dto: DriverSettlementDto) {
    try {
      const driverIdentifier = dto.driverId;
      if (!driverIdentifier) {
        return new ApiResponse(400, {}, Msg.ID_REQUIRED);
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

      const settleAmount = Number(dto.amount);
      if (isNaN(settleAmount) || settleAmount <= 0) {
        return new ApiResponse(
          400,
          {},
          'Valid positive settlement amount is required',
        );
      }

      const previousEarningsWithCash = Number(driver.earningsWithCash || 0);
      const previousEarningsWithoutCash = Number(
        driver.earningsWithoutCash || 0,
      );
      const previousTotalEarnings = Number(driver.totalEarnings || 0);

      const settleTarget = (dto.settlementType || 'TOTAL').toUpperCase();

      let newCash = previousEarningsWithCash;
      let newNonCash = previousEarningsWithoutCash;

      if (settleTarget === 'CASH') {
        newCash = Math.max(
          0,
          Number((previousEarningsWithCash - settleAmount).toFixed(2)),
        );
      } else if (settleTarget === 'NON_CASH' || settleTarget === 'CARD') {
        newNonCash = Math.max(
          0,
          Number((previousEarningsWithoutCash - settleAmount).toFixed(2)),
        );
      } else {
        // TOTAL: deduct from non-cash first, then cash
        let rem = settleAmount;
        if (newNonCash >= rem) {
          newNonCash = Number((newNonCash - rem).toFixed(2));
          rem = 0;
        } else {
          rem = Number((rem - newNonCash).toFixed(2));
          newNonCash = 0;
          newCash = Math.max(0, Number((newCash - rem).toFixed(2)));
        }
      }

      driver.earningsWithCash = newCash;
      driver.earningsWithoutCash = newNonCash;
      driver.totalEarnings = Number((newCash + newNonCash).toFixed(2));
      driver.isEarningsManuallySet = true;
      await driver.save();

      // Record settlement audit log
      const auditLog = new this.driverEarningsAuditModel({
        driverObjectId: driver._id.toString(),
        driverId: driver.driverId,
        driverName: driver.driverName,
        mobileNumber: driver.mobileNumber,
        actionType: 'SETTLEMENT',
        previousEarningsWithCash,
        newEarningsWithCash: driver.earningsWithCash,
        previousEarningsWithoutCash,
        newEarningsWithoutCash: driver.earningsWithoutCash,
        previousTotalEarnings,
        newTotalEarnings: driver.totalEarnings,
        cashDifference: Number(
          (driver.earningsWithCash - previousEarningsWithCash).toFixed(2),
        ),
        nonCashDifference: Number(
          (driver.earningsWithoutCash - previousEarningsWithoutCash).toFixed(2),
        ),
        totalDifference: Number(
          (driver.totalEarnings - previousTotalEarnings).toFixed(2),
        ),
        settlementAmount: settleAmount,
        settlementMethod: dto.paymentMethod || 'BANK_TRANSFER',
        note: dto.note || `Settlement payout of $${settleAmount}`,
        updatedBy: dto.updatedBy || 'ADMIN',
      });
      await auditLog.save();

      return new ApiResponse(
        200,
        {
          driver: {
            _id: driver._id,
            driverId: driver.driverId,
            driverName: driver.driverName,
            earningsWithCash: driver.earningsWithCash,
            earningsWithoutCash: driver.earningsWithoutCash,
            totalEarnings: driver.totalEarnings,
          },
          audit: auditLog,
        },
        Msg.DRIVER_SETTLEMENT_PROCESSED,
      );
    } catch (error) {
      console.log(`Error while processing driver settlement:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getDriverEarningsHistory(driverIdentifier: string, query: any) {
    try {
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

      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      const filter: any = {
        $or: [
          { driverObjectId: driver._id.toString() },
          { driverId: driver.driverId },
        ],
      };

      if (query.actionType) {
        filter.actionType = query.actionType.toUpperCase();
      }

      const [total, history] = await Promise.all([
        this.driverEarningsAuditModel.countDocuments(filter),
        this.driverEarningsAuditModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
      ]);

      return new ApiResponse(
        200,
        {
          driver: {
            _id: driver._id,
            driverId: driver.driverId,
            driverName: driver.driverName,
            mobileNumber: driver.mobileNumber,
            currentEarningsWithCash: driver.earningsWithCash,
            currentEarningsWithoutCash: driver.earningsWithoutCash,
            currentTotalEarnings: driver.totalEarnings,
          },
          history,
          total,
          page,
          limit,
        },
        Msg.DRIVER_EARNINGS_HISTORY_FETCHED,
      );
    } catch (error) {
      console.log(`Error while fetching driver earnings history:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateTheBatch(dto: UpdateDriverBatchDto) {
    try {
      const driver = await this.driverModel.findOne({
        _id: dto.driverId,
      });
      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }
      driver.batch = dto.batchNumber;
      await driver.save();
      let driverObj = {
        _id: driver._id,
        driverId: driver.driverId,
        batchNumber: driver.batch,
      };
      return new ApiResponse(200, driverObj, Msg.DRIVER_BATCH_UPDATED);
    } catch (error) {
      console.log(`Error while updating batch `, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateBatchesBulk(dto: BulkUpdateDriverBatchDto) {
    try {
      const result = await this.driverModel.updateMany(
        { _id: { $in: dto.driverIds } },
        { $set: { batch: dto.batchNumber } },
      );

      return new ApiResponse(
        200,
        { updatedCount: result.modifiedCount },
        Msg.DRIVER_BATCHES_UPDATED,
      );
    } catch (error) {
      console.log(`Error while updating driver batches in bulk `, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async deleteDriver(id: string) {
    try {
      const driver = await this.driverModel.findByIdAndDelete(id);
      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      let driverObj = {
        _id: driver._id,
        driverId: driver.driverId,
        mobileNumber: driver.mobileNumber,
        driverName: driver.driverName,
      };

      return new ApiResponse(200, driverObj, Msg.DRIVER_DELETED);
    } catch (error) {
      console.log(`Error while deleting driver `, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

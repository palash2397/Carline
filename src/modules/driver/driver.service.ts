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
import {
  normalizePhoneNumber,
  buildPhoneMatchConditions,
} from 'src/common/utils/phone-formatter.util';

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
        const numId = parseInt(id) || 0;
        const phoneConditions = buildPhoneMatchConditions(id, 'mobileNumber');
        driver = await this.driverModel.findOne({
          $or: [
            ...(numId > 0 ? [{ driverId: numId }] : []),
            ...phoneConditions,
          ],
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
        const trimmed = String(query.search).trim();
        const cleanDigits = trimmed.replace(/\D/g, '');
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const orConditions: any[] = [
          { driverName: { $regex: escaped, $options: 'i' } },
          { assignQueue: { $regex: escaped, $options: 'i' } },
        ];

        // If numeric ID
        const numId = Number(trimmed);
        if (!isNaN(numId) && Number.isInteger(numId) && cleanDigits.length <= 6) {
          orConditions.push({ driverId: numId });
        }

        // If phone digits provided (support all formats: +1, 1, dashes, parentheses, 10 digits)
        if (cleanDigits.length >= 3) {
          const phoneConditions = buildPhoneMatchConditions(
            trimmed,
            'mobileNumber',
          );
          orConditions.push(...phoneConditions);

          // Direct partial regex on mobileNumber
          orConditions.push({
            mobileNumber: { $regex: cleanDigits, $options: 'i' },
          });

          // Last 10 digits regex
          if (cleanDigits.length >= 10) {
            const last10 = cleanDigits.slice(-10);
            orConditions.push({
              mobileNumber: { $regex: last10, $options: 'i' },
            });
          }
        } else {
          orConditions.push({
            mobileNumber: { $regex: escaped, $options: 'i' },
          });
        }

        searchFilter.$or = orConditions;
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
      const rawMobile = dto.mobileNumber || '';
      const normalizedPhone = normalizePhoneNumber(rawMobile);
      if (!normalizedPhone || normalizedPhone.length < 7) {
        return new ApiResponse(400, {}, 'Valid mobile number is required');
      }

      const phoneConditions = buildPhoneMatchConditions(
        rawMobile,
        'mobileNumber',
      );
      const existing = await this.driverModel.findOne({ $or: phoneConditions });
      if (existing) {
        return new ApiResponse(
          409,
          {
            existingDriver: {
              _id: existing._id,
              driverId: existing.driverId,
              driverName: existing.driverName,
              mobileNumber: existing.mobileNumber,
            },
          },
          'This phone number already exists.',
        );
      }

      const lastDriver = await this.driverModel
        .findOne()
        .sort({ driverId: -1 });
      const newDriverId =
        lastDriver && lastDriver.driverId ? lastDriver.driverId + 1 : 1;

      const newDriver = new this.driverModel({
        ...dto,
        status: dto.status || 'ACTIVE',
        mobileNumber: normalizedPhone,
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
      let existingDriver = await this.driverModel
        .findById(dto.id)
        .catch(() => null);

      if (!existingDriver) {
        const numId = Number(dto.id);
        if (!isNaN(numId)) {
          existingDriver = await this.driverModel.findOne({ driverId: numId });
        }
      }

      if (!existingDriver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const updateData: any = { ...dto };
      delete updateData.id;

      if (dto.mobileNumber) {
        const normalizedPhone = normalizePhoneNumber(dto.mobileNumber);
        if (!normalizedPhone || normalizedPhone.length < 7) {
          return new ApiResponse(400, {}, 'Valid mobile number is required');
        }

        const phoneConditions = buildPhoneMatchConditions(
          dto.mobileNumber,
          'mobileNumber',
        );
        const duplicate = await this.driverModel.findOne({
          _id: { $ne: existingDriver._id },
          $or: phoneConditions,
        });
        if (duplicate) {
          return new ApiResponse(
            409,
            {
              existingDriver: {
                _id: duplicate._id,
                driverId: duplicate.driverId,
                driverName: duplicate.driverName,
                mobileNumber: duplicate.mobileNumber,
              },
            },
            'This phone number already exists.',
          );
        }
        updateData.mobileNumber = normalizedPhone;
      }

      if (dto.batch !== undefined && dto.batch !== null) {
        updateData.batch = Number(dto.batch);
      }

      if (dto.status === 'Unblock') {
        updateData.status = 'ACTIVE';
      }

      if (dto.assignQueue) {
        const norm = dto.assignQueue.toUpperCase().trim();
        if (norm === 'LOCAL' || norm === 'LOCAL_RIDES') {
          updateData.queueType = 'LOCAL';
        } else if (norm === 'LONG_DISTANCE' || norm === 'LONG_DISTANCE_RIDE') {
          updateData.queueType = 'LONG_DISTANCE';
        } else if (norm === 'BOTH' || norm === 'ALL_RIDES' || norm === 'ALL') {
          updateData.queueType = 'BOTH';
        }
      } else if (dto.queueType) {
        const norm = dto.queueType.toUpperCase().trim();
        if (norm === 'LOCAL' || norm === 'LOCAL_RIDES') {
          updateData.queueType = 'LOCAL';
          updateData.assignQueue = 'Local_Rides';
        } else if (norm === 'LONG_DISTANCE' || norm === 'LONG_DISTANCE_RIDE') {
          updateData.queueType = 'LONG_DISTANCE';
          updateData.assignQueue = 'Long_Distance_Ride';
        } else if (norm === 'BOTH' || norm === 'ALL_RIDES' || norm === 'ALL') {
          updateData.queueType = 'BOTH';
          updateData.assignQueue = 'BOTH';
        }
      }

      if (
        updateData.status === 'Block' ||
        updateData.status === 'INACTIVE'
      ) {
        updateData.isLoggedIn = false;
        updateData.isAvailable = false;
        updateData.loginLogout = 'STOP';
        updateData.logoutTime = new Date().toISOString();
      } else if (
        updateData.loginLogout?.toUpperCase() === 'STOP' ||
        updateData.loginLogout?.toUpperCase() === 'LOGOUT' ||
        updateData.isLoggedIn === false
      ) {
        updateData.loginLogout = 'STOP';
        updateData.isLoggedIn = false;
        updateData.isAvailable = false;
        updateData.logoutTime = new Date().toISOString();
      } else if (
        updateData.loginLogout?.toUpperCase() === 'START' ||
        updateData.loginLogout?.toUpperCase() === 'LOGIN' ||
        updateData.isLoggedIn === true
      ) {
        updateData.loginLogout = 'START';
        updateData.isLoggedIn = true;
        updateData.isAvailable = true;
        updateData.loginTime = new Date().toISOString();
      }

      const updatedDriver = await this.driverModel.findByIdAndUpdate(
        existingDriver._id,
        { $set: updateData },
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
        const numId = parseInt(driverIdentifier) || 0;
        const phoneConditions = buildPhoneMatchConditions(
          String(driverIdentifier),
          'mobileNumber',
        );
        driver = await this.driverModel.findOne({
          $or: [
            ...(numId > 0 ? [{ driverId: numId }] : []),
            ...phoneConditions,
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
      let driver = await this.driverModel
        .findById(dto.driverId)
        .catch(() => null);

      if (!driver) {
        const numId = Number(dto.driverId);
        if (!isNaN(numId)) {
          driver = await this.driverModel.findOne({ driverId: numId });
        }
      }

      if (!driver) {
        driver = await this.driverModel.findOne({
          mobileNumber: dto.driverId,
        });
      }

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const targetBatch =
        dto.batchNumber !== undefined
          ? Number(dto.batchNumber)
          : dto.batch !== undefined
            ? Number(dto.batch)
            : 1;

      driver.batch = targetBatch;
      await driver.save();

      const driverObj = {
        _id: driver._id,
        driverId: driver.driverId,
        batchNumber: driver.batch,
        batch: driver.batch,
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
      let driver: DriverDocument | null = null;
      if (isValidObjectId(id)) {
        driver = await this.driverModel.findById(id);
      }
      if (!driver) {
        const cleanDigits = id ? id.replace(/\D/g, '') : '';
        driver = await this.driverModel.findOne({
          $or: [
            { driverId: parseInt(id) || 0 },
            { mobileNumber: id },
            ...(cleanDigits ? [{ mobileNumber: cleanDigits }] : []),
          ],
        });
      }

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const cleanPhone = (driver.mobileNumber || '').replace(/\D/g, '');

      // Delete driver and any remaining duplicate records with the same phone number
      await this.driverModel.deleteMany({
        $or: [
          { _id: driver._id },
          ...(cleanPhone ? [{ mobileNumber: cleanPhone }] : []),
          ...(driver.mobileNumber
            ? [{ mobileNumber: driver.mobileNumber }]
            : []),
        ],
      });

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

  async getDriverEarningsRange(driverIdentifier: string, query: any) {
    try {
      let driver: DriverDocument | null = null;
      if (isValidObjectId(driverIdentifier)) {
        driver = await this.driverModel.findById(driverIdentifier);
      }
      if (!driver) {
        const numId = parseInt(driverIdentifier) || 0;
        const phoneConditions = buildPhoneMatchConditions(
          String(driverIdentifier),
          'mobileNumber',
        );
        driver = await this.driverModel.findOne({
          $or: [
            ...(numId > 0 ? [{ driverId: numId }] : []),
            ...phoneConditions,
          ],
        });
      }

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const numberDigits = (driver.mobileNumber || '').replace(/\D/g, '');
      const driverMatchConditions: any[] = [
        { driverId: driver._id.toString() },
        { driverNumber: driver.mobileNumber },
      ];
      if (driver.driverId) {
        driverMatchConditions.push({ driverId: String(driver.driverId) });
      }
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

      const rideQuery: any = {
        $or: driverMatchConditions,
        rideStatus: { $in: [RideStatus.COMPLETED, 'COMPLETED'] },
      };

      let startDate: Date | null = null;
      let endDate: Date | null = null;

      if (query.fromDate) {
        const d = new Date(query.fromDate);
        if (!isNaN(d.getTime())) {
          d.setHours(0, 0, 0, 0);
          startDate = d;
        }
      }

      if (query.toDate) {
        const d = new Date(query.toDate);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          endDate = d;
        }
      }

      if (startDate || endDate) {
        const dateCond: any = {};
        if (startDate) dateCond.$gte = startDate;
        if (endDate) dateCond.$lte = endDate;

        const orDateList: any[] = [{ createdAt: dateCond }];
        if (startDate) {
          orDateList.push({
            rideCompleteDateTime: {
              $gte: startDate.toISOString(),
              ...(endDate ? { $lte: endDate.toISOString() } : {}),
            },
          });
        }
        rideQuery.$and = [{ $or: orDateList }];
      }

      const completedRides = await this.rideModel
        .find(rideQuery)
        .sort({ createdAt: -1, rideCompleteDateTime: -1 })
        .lean()
        .exec();

      let totalFares = 0;
      let totalCash = 0;
      let totalCreditCard = 0;
      let totalAccount = 0;

      const commissionPercentage =
        driver.commissionPercentage !== undefined &&
        driver.commissionPercentage !== null
          ? Number(driver.commissionPercentage)
          : 30;
      const driverSharePercentage = Number((100 - commissionPercentage).toFixed(2));

      const trips = completedRides.map((ride: any) => {
        const fare = Number((ride.rideAmount || 0).toFixed(2));
        totalFares += fare;

        const payment = String(
          ride.paymentType || ride.payment || 'CASH',
        ).toUpperCase();

        let standardizedPayment = 'CASH';
        if (payment === 'CASH') {
          totalCash += fare;
          standardizedPayment = 'CASH';
        } else if (
          payment === 'CARD' ||
          payment === 'CREDIT_CARD' ||
          payment === 'STRIPE'
        ) {
          totalCreditCard += fare;
          standardizedPayment = 'CREDIT_CARD';
        } else if (
          payment === 'ACCOUNT' ||
          payment === 'CUSTOMER_ACCOUNT'
        ) {
          totalAccount += fare;
          standardizedPayment = 'CUSTOMER_ACCOUNT';
        } else {
          totalCreditCard += fare;
          standardizedPayment = 'CREDIT_CARD';
        }

        const driverShare = Number(
          (fare * (driverSharePercentage / 100)).toFixed(2),
        );
        const companyCommission = Number(
          (fare * (commissionPercentage / 100)).toFixed(2),
        );

        return {
          _id: ride._id,
          tripNumber: ride.tripNumber || 'N/A',
          completedAt:
            ride.rideCompleteDateTime ||
            ride.createdAt ||
            ride.ridePaymentDateTime,
          customerName: ride.customerName || 'N/A',
          customerNumber: ride.customerNumber || 'N/A',
          zone: ride.selectedZone || 'N/A',
          fare,
          paymentType: standardizedPayment,
          driverShare,
          companyCommission,
          rideStatus: ride.rideStatus || 'COMPLETED',
        };
      });

      totalFares = Number(totalFares.toFixed(2));
      totalCash = Number(totalCash.toFixed(2));
      totalCreditCard = Number(totalCreditCard.toFixed(2));
      totalAccount = Number(totalAccount.toFixed(2));

      const driverTotalEarnings = Number(
        (totalFares * (driverSharePercentage / 100)).toFixed(2),
      );
      const companyTotalCommission = Number(
        (totalFares * (commissionPercentage / 100)).toFixed(2),
      );

      // 1. Driver collected cash -> Driver owes company commission on cash trips
      const companyShareOfCash = Number(
        (totalCash * (commissionPercentage / 100)).toFixed(2),
      );

      // 2. Company collected non-cash (Credit Card + Customer Account) -> Company owes driver share
      const nonCashTotal = Number((totalCreditCard + totalAccount).toFixed(2));
      const driverShareOfNonCash = Number(
        (nonCashTotal * (driverSharePercentage / 100)).toFixed(2),
      );

      // Net Balance = (Company Share of Cash) - (Driver Share of Non-Cash)
      const netBalance = Number(
        (companyShareOfCash - driverShareOfNonCash).toFixed(2),
      );

      let settlementStatus = 'SETTLED';
      let amountDriverOwesCompany = 0;
      let amountCompanyOwesDriver = 0;
      let summaryText = 'Accounts are fully settled ($0.00)';

      if (netBalance > 0) {
        settlementStatus = 'DRIVER_OWES_COMPANY';
        amountDriverOwesCompany = netBalance;
        summaryText = `Driver owes company $${netBalance.toFixed(2)}`;
      } else if (netBalance < 0) {
        settlementStatus = 'COMPANY_OWES_DRIVER';
        amountCompanyOwesDriver = Number(Math.abs(netBalance).toFixed(2));
        summaryText = `Company owes driver $${amountCompanyOwesDriver.toFixed(2)}`;
      }

      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 50;
      const skip = (page - 1) * limit;
      const paginatedTrips = trips.slice(skip, skip + limit);

      return new ApiResponse(
        200,
        {
          driver: {
            _id: driver._id,
            driverId: driver.driverId,
            driverName: driver.driverName,
            mobileNumber: driver.mobileNumber,
            commissionPercentage,
            driverSharePercentage,
          },
          period: {
            fromDate: query.fromDate || null,
            toDate: query.toDate || null,
            filterApplied: Boolean(startDate || endDate),
          },
          financialTotals: {
            totalTripsCount: trips.length,
            totalFares,
            totalCash,
            totalCreditCard,
            totalAccount,
            commissionPercentage,
            driverSharePercentage,
            driverTotalEarnings,
            companyTotalCommission,
          },
          settlement: {
            cashCollectedByDriver: totalCash,
            companyShareOfCash,
            nonCashCollectedByCompany: nonCashTotal,
            driverShareOfNonCash,
            netBalance,
            settlementStatus,
            amountDriverOwesCompany,
            amountCompanyOwesDriver,
            summaryText,
          },
          trips: paginatedTrips,
          pagination: {
            total: trips.length,
            page,
            limit,
            totalPages: Math.ceil(trips.length / limit) || 1,
          },
        },
        'Driver earnings report fetched successfully',
      );
    } catch (error) {
      console.log(`Error while fetching driver earnings report:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async exportDriverEarningsRange(
    driverIdentifier: string,
    query: any,
    res: any,
  ) {
    try {
      const reportRes = await this.getDriverEarningsRange(driverIdentifier, {
        ...query,
        page: 1,
        limit: 100000,
      });

      if (reportRes.statusCode !== 200) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(reportRes.statusCode).json(reportRes);
      }

      const data = reportRes.data;
      const driver = data.driver;
      const totals = data.financialTotals;
      const settlement = data.settlement;
      const trips = data.trips || [];

      function escapeCsv(val: any) {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }

      const lines: string[] = [];
      lines.push('DRIVER EARNINGS & SETTLEMENT REPORT');
      lines.push(`Driver Name,${escapeCsv(driver.driverName)}`);
      lines.push(`Driver ID,${escapeCsv(driver.driverId)}`);
      lines.push(`Driver Phone,${escapeCsv(driver.mobileNumber)}`);
      lines.push(`Period From,${escapeCsv(data.period.fromDate || 'All Time')}`);
      lines.push(`Period To,${escapeCsv(data.period.toDate || 'Present')}`);
      lines.push(`Commission Rate,${driver.commissionPercentage}%`);
      lines.push(`Driver Share Rate,${driver.driverSharePercentage}%`);
      lines.push('');
      lines.push('FINANCIAL SUMMARY');
      lines.push(`Total Trips,${totals.totalTripsCount}`);
      lines.push(`Total Fares ($),${totals.totalFares.toFixed(2)}`);
      lines.push(
        `Total Cash Collected by Driver ($),${totals.totalCash.toFixed(2)}`,
      );
      lines.push(`Total Credit Card ($),${totals.totalCreditCard.toFixed(2)}`);
      lines.push(
        `Total Account Payments ($),${totals.totalAccount.toFixed(2)}`,
      );
      lines.push(
        `Driver Total Earnings ($),${totals.driverTotalEarnings.toFixed(2)}`,
      );
      lines.push(
        `Company Total Commission ($),${totals.companyTotalCommission.toFixed(2)}`,
      );
      lines.push('');
      lines.push('SETTLEMENT BREAKDOWN');
      lines.push(`Settlement Status,${settlement.settlementStatus}`);
      lines.push(
        `Amount Driver Owes Company ($),${settlement.amountDriverOwesCompany.toFixed(2)}`,
      );
      lines.push(
        `Amount Company Owes Driver ($),${settlement.amountCompanyOwesDriver.toFixed(2)}`,
      );
      lines.push(`Summary,${escapeCsv(settlement.summaryText)}`);
      lines.push('');
      lines.push('TRIP DETAILS');
      lines.push(
        [
          'Trip Number',
          'Date / Time',
          'Customer Name',
          'Customer Phone',
          'Zone',
          'Fare ($)',
          'Payment Type',
          'Driver Share ($)',
          'Company Share ($)',
          'Status',
        ].join(','),
      );

      for (const t of trips) {
        lines.push(
          [
            escapeCsv(t.tripNumber),
            escapeCsv(t.completedAt),
            escapeCsv(t.customerName),
            escapeCsv(t.customerNumber),
            escapeCsv(t.zone),
            escapeCsv(t.fare.toFixed(2)),
            escapeCsv(t.paymentType),
            escapeCsv(t.driverShare.toFixed(2)),
            escapeCsv(t.companyCommission.toFixed(2)),
            escapeCsv(t.rideStatus),
          ].join(','),
        );
      }

      const csvContent = '\uFEFF' + lines.join('\r\n');
      const filename = `driver-earnings-${driver.driverId || driver._id}-${data.period.fromDate || 'start'}-to-${data.period.toDate || 'end'}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );

      return csvContent;
    } catch (error) {
      console.log(`Error while exporting driver earnings:`, error);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json(new ApiResponse(500, {}, Msg.SERVER_ERROR));
    }
  }
}

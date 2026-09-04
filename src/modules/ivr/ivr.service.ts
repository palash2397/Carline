import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IvrDispatchActionDto, IvrDriverActionDto } from './dto/ivr-action.dto';
import { Driver, DriverDocument } from '../driver/schema/driver.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { RideStatus } from 'src/common/enums/ride/ride-enum';

import axios from 'axios';
import { Msg } from 'src/helpers/responseMsg';

@Injectable()
export class IvrService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
  ) {}

  async processDriverAction(dto: IvrDriverActionDto) {
    const driver = await this.driverModel.findOne({
      mobileNumber: dto.callerNumber,
    });

    if (!driver) {
      return new ApiResponse(
        403,
        { action: 'HANGUP' },
        Msg.DRIVER_UNRECOGNIZED,
      );
    }

    if (driver.activeRideId) {
      const activeRide = await this.rideModel.findById(driver.activeRideId);

      if (!activeRide) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (!dto.dtmfInput) {
        if (activeRide.rideStatus === RideStatus.ACCEPTED) {
          return new ApiResponse(
            200,
            { menu: 'START_OR_CANCEL' },
            'Play start/cancel menu',
          );
        } else if (activeRide.rideStatus === RideStatus.STARTED) {
          return new ApiResponse(200, { menu: 'FINISH' }, 'Play finish menu');
        }
      } else {
        if (
          activeRide.rideStatus === RideStatus.ACCEPTED &&
          dto.dtmfInput === '1'
        ) {
          activeRide.rideStatus = RideStatus.STARTED;
          activeRide.rideStartDateTime = new Date().toISOString();
          await activeRide.save();
          return new ApiResponse(
            200,
            { action: 'SAY_STARTED' },
            Msg.RIDE_STARTED,
          );
        } else if (
          activeRide.rideStatus === RideStatus.ACCEPTED &&
          dto.dtmfInput === '3'
        ) {
          activeRide.rideStatus = RideStatus.PENDING;
          activeRide.driverId = '';
          driver.activeRideId = '';
          driver.isAvailable = true;
          await activeRide.save();
          await driver.save();
          return new ApiResponse(
            200,
            { action: 'SAY_CANCELLED' },
            Msg.RIDE_CANCELLED,
          );
        } else if (
          activeRide.rideStatus === RideStatus.STARTED &&
          dto.dtmfInput === '2'
        ) {
          activeRide.rideStatus = RideStatus.PAYMENT_PENDING;
          activeRide.rideCompleteDateTime = new Date().toISOString();
          // We keep the driver locked to the trip until payment is done
          await activeRide.save();
          await driver.save();
          return new ApiResponse(
            200,
            { action: 'SAY_COMPLETED' },
            Msg.RIDE_COMPLETED,
          );
        }
      }
    } else {
      if (!dto.dtmfInput) {
        return new ApiResponse(
          200,
          { menu: 'LOGIN_LOGOUT' },
          'Play login menu',
        );
      }

      if (dto.dtmfInput === '1' && !driver.isLoggedIn) {
        driver.isLoggedIn = true;
        driver.isAvailable = true;
        driver.queueType = 'BOTH';
        await driver.save();
        return new ApiResponse(
          200,
          { action: 'SAY_LOGGED_IN' },
          Msg.USER_LOGIN,
        );
      } else if (dto.dtmfInput === '2' && driver.isLoggedIn) {
        driver.isLoggedIn = false;
        driver.isAvailable = false;
        await driver.save();
        return new ApiResponse(
          200,
          { action: 'SAY_LOGGED_OUT' },
          Msg.USER_LOGGED_OUT,
        );
      }
    }

    return new ApiResponse(200, { action: 'INVALID_INPUT' }, Msg.INVALID_INPUT);
  }

  private dispatchLocks = new Map<string, { driverNumber: string; acceptedAt: Date }>();

  async processDispatchAction(dto: IvrDispatchActionDto) {
    const driver = await this.driverModel.findOne({
      mobileNumber: dto.driverNumber,
    });
    if (!driver) return new ApiResponse(403, {}, Msg.DRIVER_NOT_FOUND);

    if (!dto.dispatchId && !dto.tripNumber) {
      return new ApiResponse(400, {}, 'Either dispatchId or tripNumber is required');
    }

    // --- PRE-BOOKING DISPATCH FLOW (Using dispatchId) ---
    if (dto.dispatchId) {
      if (dto.dtmfInput === '1') {
        const existingLock = this.dispatchLocks.get(dto.dispatchId);
        if (existingLock) {
          if (existingLock.driverNumber === dto.driverNumber) {
            return new ApiResponse(
              200,
              { action: 'SAY_ACCEPTED' },
              Msg.RIDE_ASSIGNED_TO_YOU,
            );
          } else {
            return new ApiResponse(
              400,
              { action: 'SAY_ALREADY_ASSIGNED' },
              Msg.RIDE_ALREADY_ASSIGNED,
            );
          }
        }

        // Acquire lock for this driver
        this.dispatchLocks.set(dto.dispatchId, {
          driverNumber: dto.driverNumber,
          acceptedAt: new Date(),
        });

        this.cleanupDispatchLocks();
        this.cancelOtherCalls(dto.dispatchId).catch(console.error);

        return new ApiResponse(
          200,
          { action: 'SAY_ACCEPTED' },
          Msg.RIDE_ASSIGNED_TO_YOU,
        );
      } else if (dto.dtmfInput === '2') {
        return new ApiResponse(
          200,
          { action: 'SAY_REJECTED' },
          Msg.RIDE_NOT_ACCEPTED,
        );
      } else if (dto.dtmfInput === '0') {
        return new ApiResponse(
          200,
          { action: 'SAY_REPLAY' },
          'Replay requested',
        );
      }
    }

    // --- POST-BOOKING DISPATCH FLOW (Using tripNumber) ---
    if (dto.tripNumber) {
      if (dto.dtmfInput === '1') {
        const result = await this.rideModel.updateOne(
          { tripNumber: dto.tripNumber, rideStatus: RideStatus.PENDING },
          {
            $set: {
              rideStatus: RideStatus.ACCEPTED,
              driverId: driver._id.toString(),
            },
          },
        );

        if (result.modifiedCount === 0) {
          return new ApiResponse(
            400,
            { action: 'SAY_ALREADY_ASSIGNED' },
            Msg.RIDE_ALREADY_ASSIGNED,
          );
        }
        const trip = await this.rideModel.findOne({ tripNumber: dto.tripNumber });
        driver.activeRideId = trip ? trip._id.toString() : '';
        driver.isAvailable = false;
        await driver.save();

        this.cancelOtherCalls(dto.tripNumber).catch(console.error);

        return new ApiResponse(
          200,
          { action: 'SAY_ACCEPTED' },
          Msg.RIDE_ASSIGNED_TO_YOU,
        );
      } else if (dto.dtmfInput === '2') {
        return new ApiResponse(
          200,
          { action: 'SAY_REJECTED' },
          Msg.RIDE_NOT_ACCEPTED,
        );
      } else if (dto.dtmfInput === '0') {
        return new ApiResponse(
          200,
          { action: 'SAY_REPLAY' },
          'Replay requested',
        );
      }
    }

    return new ApiResponse(200, { action: 'HANGUP' }, Msg.RIDE_NOT_ACCEPTED);
  }

  private cleanupDispatchLocks() {
    const now = Date.now();
    for (const [key, lock] of this.dispatchLocks.entries()) {
      if (now - lock.acceptedAt.getTime() > 30 * 60 * 1000) {
        this.dispatchLocks.delete(key);
      }
    }
  }

  async getOnlineBatches(queueType?: string) {
    try {
      const query: any = {
        isLoggedIn: true,
        isAvailable: true,
      };

      if (queueType) {
        query.queueType = { $in: [queueType, 'BOTH'] };
      }

      const eligibleDrivers = await this.driverModel.find(query);

      const mapDriver = (d: DriverDocument) => ({
        driverId: d.driverId,
        mobileNumber: d.mobileNumber,
        countryCode: d.countryCode || '',
      });

      const batch1Drivers = eligibleDrivers.filter((d) => d.batch === 1).map(mapDriver);
      const batch2Drivers = eligibleDrivers.filter((d) => d.batch === 2).map(mapDriver);
      const batch3Drivers = eligibleDrivers.filter((d) => d.batch === 3).map(mapDriver);

      return new ApiResponse(
        200,
        {
          batches: {
            batch1: {
              startAfterSeconds: 0,
              drivers: batch1Drivers,
            },
            batch2: {
              startAfterSeconds: 15,
              drivers: batch2Drivers,
            },
            batch3: {
              startAfterSeconds: 25,
              drivers: batch3Drivers,
            },
          },
          batchSizes: {
            b1: batch1Drivers.length,
            b2: batch2Drivers.length,
            b3: batch3Drivers.length,
          },
        },
        'Online batches fetched successfully',
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getDriverStatus(mobileNumber: string) {
    try {
      const driver = await this.driverModel.findOne({ mobileNumber });
      
      if (!driver) {
        return new ApiResponse(404, { registered: false }, Msg.DRIVER_NOT_FOUND);
      }

      let workflowStage = 'NO_ACTIVE_TRIP';
      let activeTripData: any = null;

      if (driver.activeRideId) {
        const ride = await this.rideModel.findById(driver.activeRideId);
        if (ride) {
          if (ride.rideStatus === RideStatus.ACCEPTED) {
            workflowStage = 'ASSIGNED_NOT_STARTED';
            activeTripData = {
              tripId: ride._id,
              tripNumber: ride.tripNumber
            };
          } else if (ride.rideStatus === RideStatus.STARTED) {
            workflowStage = 'IN_PROGRESS';
            activeTripData = {
              tripId: ride._id,
              tripNumber: ride.tripNumber
            };
          } else if (ride.rideStatus === RideStatus.PAYMENT_PENDING) {
            workflowStage = 'AWAITING_PAYMENT';
            
            let durationMinutes = 0;
            if (ride.rideStartDateTime && ride.rideCompleteDateTime) {
              const start = new Date(ride.rideStartDateTime).getTime();
              const end = new Date(ride.rideCompleteDateTime).getTime();
              durationMinutes = Math.ceil((end - start) / 60000); 
            }
            
            const calculatedFare = durationMinutes * 0.50;
            
            activeTripData = {
              tripId: ride._id,
              tripNumber: ride.tripNumber,
              durationMinutes,
              calculatedFare,
              finalFare: calculatedFare,
              currency: 'USD'
            };
          }
        }
      }

      return new ApiResponse(200, {
        registered: true,
        driverId: driver.driverId,
        driverName: driver.driverName,
        phoneNumber: driver.mobileNumber,
        loggedIn: driver.isLoggedIn,
        serviceType: driver.queueType,
        available: driver.isAvailable,
        workflowStage,
        activeTrip: activeTripData
      }, 'Driver status fetched');

    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  private async cancelOtherCalls(tripNumber: string) {
    const pythonUrl = process.env.PYTHON_IVR_URL || 'http://localhost:5000';
    try {
      await axios.post(`${pythonUrl}/api/cancel-calls`, { tripNumber });
    } catch (err) {
      console.log('Failed to notify Python to cancel calls', err.message);
    }
  }
}

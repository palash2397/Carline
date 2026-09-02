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
          activeRide.rideStatus = RideStatus.COMPLETED;
          driver.activeRideId = '';
          driver.isAvailable = true;
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

  async processDispatchAction(dto: IvrDispatchActionDto) {
    const driver = await this.driverModel.findOne({
      mobileNumber: dto.driverNumber,
    });
    if (!driver) return new ApiResponse(403, {}, Msg.DRIVER_NOT_FOUND);

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
    }

    return new ApiResponse(200, { action: 'HANGUP' }, Msg.RIDE_NOT_ACCEPTED);
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

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IvrDispatchActionDto, IvrDriverActionDto } from './dto/ivr-action.dto';
import { Driver, DriverDocument } from '../driver/schema/driver.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import axios from 'axios';

@Injectable()
export class IvrService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
  ) {}

  async processDriverAction(dto: IvrDriverActionDto) {
    // Look up the driver by callerNumber
    const driver = await this.driverModel.findOne({ mobileNumber: dto.callerNumber });
    
    if (!driver) {
      return new ApiResponse(403, { action: 'HANGUP' }, 'Unrecognized driver');
    }

    // Logic based on state and input
    // If they have an active ride...
    if (driver.activeRideId) {
      const activeRide = await this.rideModel.findById(driver.activeRideId);
      
      if (!dto.dtmfInput) {
        // Just calling in, no input yet. Tell Python what menu to play.
        if (activeRide.rideStatus === 'ACCEPTED') {
          return new ApiResponse(200, { menu: 'START_OR_CANCEL' }, 'Play start/cancel menu');
        } else if (activeRide.rideStatus === 'STARTED') {
          return new ApiResponse(200, { menu: 'FINISH' }, 'Play finish menu');
        }
      } else {
        // Process DTMF for active ride
        if (activeRide.rideStatus === 'ACCEPTED' && dto.dtmfInput === '1') {
          activeRide.rideStatus = 'STARTED';
          await activeRide.save();
          return new ApiResponse(200, { action: 'SAY_STARTED' }, 'Ride started');
        } else if (activeRide.rideStatus === 'ACCEPTED' && dto.dtmfInput === '3') {
          activeRide.rideStatus = 'PENDING'; // Or CANCELLED based on business logic
          activeRide.driverId = null;
          driver.activeRideId = null;
          driver.isAvailable = true;
          await activeRide.save();
          await driver.save();
          return new ApiResponse(200, { action: 'SAY_CANCELLED' }, 'Ride cancelled');
        } else if (activeRide.rideStatus === 'STARTED' && dto.dtmfInput === '2') {
          activeRide.rideStatus = 'COMPLETED';
          driver.activeRideId = null;
          driver.isAvailable = true;
          await activeRide.save();
          await driver.save();
          return new ApiResponse(200, { action: 'SAY_COMPLETED' }, 'Ride completed');
        }
      }
    } else {
      // No active ride, handle login/logout
      if (!dto.dtmfInput) {
        return new ApiResponse(200, { menu: 'LOGIN_LOGOUT' }, 'Play login menu');
      }

      if (dto.dtmfInput === '1' && !driver.isLoggedIn) {
        // In reality, we'd return a sub-menu asking for queue type.
        // Assuming '1' means Local, '2' Long Distance, '3' Both if already in sub-menu state.
        // For simplicity here, just log them in as BOTH.
        driver.isLoggedIn = true;
        driver.isAvailable = true;
        driver.queueType = 'BOTH';
        await driver.save();
        return new ApiResponse(200, { action: 'SAY_LOGGED_IN' }, 'Logged in successfully');
      } else if (dto.dtmfInput === '2' && driver.isLoggedIn) {
        driver.isLoggedIn = false;
        driver.isAvailable = false;
        await driver.save();
        return new ApiResponse(200, { action: 'SAY_LOGGED_OUT' }, 'Logged out successfully');
      }
    }

    return new ApiResponse(200, { action: 'INVALID_INPUT' }, 'Input not understood');
  }

  async processDispatchAction(dto: IvrDispatchActionDto) {
    const driver = await this.driverModel.findOne({ mobileNumber: dto.driverNumber });
    if (!driver) return new ApiResponse(403, {}, 'Driver not found');

    if (dto.dtmfInput === '1') {
      // Accept logic (Atomic Lock)
      const result = await this.rideModel.updateOne(
        { tripNumber: dto.tripNumber, rideStatus: 'PENDING' },
        { $set: { rideStatus: 'ACCEPTED', driverId: driver._id.toString() } }
      );

      if (result.modifiedCount === 0) {
        // Someone else got it, or it was cancelled
        return new ApiResponse(400, { action: 'SAY_ALREADY_ASSIGNED' }, 'Trip already assigned');
      }

      // Lock successful
      driver.activeRideId = (await this.rideModel.findOne({ tripNumber: dto.tripNumber }))._id.toString();
      driver.isAvailable = false;
      await driver.save();

      // Fire and forget cancellation to Python
      this.cancelOtherCalls(dto.tripNumber).catch(console.error);

      return new ApiResponse(200, { action: 'SAY_ACCEPTED' }, 'Trip assigned to you');
    }

    // Reject or other input, just ignore or say okay
    return new ApiResponse(200, { action: 'HANGUP' }, 'Not accepted');
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

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ride, RideDocument } from './schema/ride.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { CustomerService } from '../customer/customer.service';
import { BookIvrRideDto } from './dto/book-ivr-ride.dto';
import { AdminDispatchDto } from './dto/admin-dispatch.dto';
import { Driver, DriverDocument } from '../driver/schema/driver.schema';
import { RideStatus } from 'src/common/enums/ride/ride-enum';
import { PaymentStatus } from 'src/common/enums/payment/payment-status';

import axios from 'axios';

@Injectable()
export class RideService {
  constructor(
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    private readonly customerService: CustomerService,
  ) {}

  async getRides(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      const searchFilter: any = {};
      if (query.search) {
        searchFilter.$or = [
          { driverName: { $regex: query.search, $options: 'i' } },
          { customerNumber: { $regex: query.search, $options: 'i' } },
          { tripNumber: { $regex: query.search, $options: 'i' } },
        ];
      }

      const total = await this.rideModel.countDocuments(searchFilter);
      const rawData = await this.rideModel
        .find(searchFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      const data = rawData.map((ride: any) => ({
        ...ride,
        payment: ride.payment || null,
        paymentType: ride.paymentType || null,
        paymentStatus: ride.paymentStatus || PaymentStatus.PENDING,
      }));

      return new ApiResponse(
        200,
        { data, total, page, limit },
        Msg.DATA_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  private normalizeQueueName(queue?: string): string {
    if (!queue) return 'BOTH';
    const normalized = queue.trim().toUpperCase();
    if (
      normalized === '1' ||
      normalized === 'LOCAL' ||
      normalized === 'LOCAL_RIDES'
    ) {
      return 'LOCAL';
    }
    if (
      normalized === '2' ||
      normalized === 'LONG_DISTANCE' ||
      normalized === 'LONG_DISTANCE_RIDE'
    ) {
      return 'LONG_DISTANCE';
    }
    if (
      normalized === '3' ||
      normalized === 'BOTH' ||
      normalized === 'ALL' ||
      normalized === 'ALL_RIDES'
    ) {
      return 'BOTH';
    }
    return queue;
  }

  async bookIvrRide(dto: BookIvrRideDto) {
    try {
      const customer = await this.customerService.findOrCreateCustomer(
        dto.customerNumber,
        'IVR Customer',
      );

      const tripNumber = `TRIP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

      const lastRide = await this.rideModel.findOne().sort({ rideId: -1 });
      const newRideId = lastRide && lastRide.rideId ? lastRide.rideId + 1 : 1;

      let driverData: DriverDocument | null = null;
      if (dto.driverNumber) {
        driverData = await this.driverModel.findOne({
          mobileNumber: dto.driverNumber,
        });
        if (!driverData) {
          return new ApiResponse(400, {}, Msg.DRIVER_NOT_FOUND);
        }
      }

      const initialStatus = driverData ? RideStatus.ACCEPTED : RideStatus.PENDING;
      const queueName = this.normalizeQueueName(dto.queueName);

      const newRide = new this.rideModel({
        rideId: newRideId,
        customerNumber: dto.customerNumber,
        customerName: customer.fullName,
        queueName: queueName,
        driverName: driverData ? driverData.driverName : '',
        driverNumber: dto.driverNumber || '',
        driverId: driverData ? driverData._id.toString() : '',
        recordingUrl: dto.recordingUrl,
        rideStartDateTime: dto.rideStart,
        rideStatus: initialStatus,
        tripNumber: tripNumber,
        payment: null,
        paymentType: null,
        paymentStatus: PaymentStatus.PENDING,
      });

      await newRide.save();

      if (driverData) {
        driverData.activeRideId = newRide._id.toString();
        driverData.isAvailable = false;
        await driverData.save();
      }

      return new ApiResponse(201, { newRide, tripNumber }, Msg.RIDE_BOOKED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async adminDispatch(dto: AdminDispatchDto) {
    try {
      const customer = await this.customerService.findOrCreateCustomer(
        dto.customerNumber,
        dto.customerName,
      );

      const tripNumber = `TRIP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      const lastRide = await this.rideModel.findOne().sort({ rideId: -1 });
      const newRideId = lastRide && lastRide.rideId ? lastRide.rideId + 1 : 1;
      const queueName = this.normalizeQueueName(dto.queueName);

      const newRide = new this.rideModel({
        rideId: newRideId,
        customerNumber: dto.customerNumber,
        customerName: customer.fullName,
        queueName: queueName,
        rideStatus: 'PENDING',
        tripNumber: tripNumber,
        payment: null,
        paymentType: null,
        paymentStatus: PaymentStatus.PENDING,
      });

      await newRide.save();

      const driverQuery: any = {
        isLoggedIn: true,
        isAvailable: true,
        status: { $nin: ['Block', 'INACTIVE'] },
      };

      if (queueName === 'LOCAL') {
        driverQuery.$or = [
          { queueType: { $in: ['LOCAL', 'Local_Rides', 'BOTH', 'All_Rides', 'ALL'] } },
          { assignQueue: { $in: ['LOCAL', 'Local_Rides', 'BOTH', 'All_Rides', 'ALL'] } },
        ];
      } else if (queueName === 'LONG_DISTANCE') {
        driverQuery.$or = [
          { queueType: { $in: ['LONG_DISTANCE', 'Long_Distance_Ride', 'BOTH', 'All_Rides', 'ALL'] } },
          { assignQueue: { $in: ['LONG_DISTANCE', 'Long_Distance_Ride', 'BOTH', 'All_Rides', 'ALL'] } },
        ];
      } else if (queueName === 'BOTH') {
        // Press 3 = BOTH: all available logged-in drivers are eligible
      } else {
        driverQuery.$or = [
          { queueType: { $in: [queueName, 'BOTH', 'All_Rides', 'ALL'] } },
          { assignQueue: { $in: [queueName, 'BOTH', 'All_Rides', 'ALL'] } },
        ];
      }

      const eligibleDrivers = await this.driverModel.find(driverQuery);

      const batch1 = eligibleDrivers
        .filter((d) => d.batch === 1)
        .map((d) => d.mobileNumber);
      const batch2 = eligibleDrivers
        .filter((d) => d.batch === 2)
        .map((d) => d.mobileNumber);
      const batch3 = eligibleDrivers
        .filter((d) => d.batch === 3)
        .map((d) => d.mobileNumber);

      const pythonUrl = process.env.PYTHON_IVR_URL || 'http://localhost:5000';

      try {
        await axios.post(`${pythonUrl}/api/call-batch`, {
          tripNumber,
          batch1,
          batch2,
          batch3,
        });
      } catch (err) {
        console.error('Failed to contact Python IVR system', err.message);
      }

      return new ApiResponse(
        201,
        {
          tripNumber,
          rideId: newRideId,
          batches: {
            batch1: batch1,
            batch2: batch2,
            batch3: batch3,
          },
          batchSizes: {
            b1: batch1.length,
            b2: batch2.length,
            b3: batch3.length,
          },
        },
        Msg.RIDE_BOOKED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

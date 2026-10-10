import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Ride, RideDocument } from './schema/ride.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { CustomerService } from '../customer/customer.service';
import { Customer, CustomerDocument } from '../customer/schema/customer.schema';
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
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private readonly customerService: CustomerService,
  ) {}

  private async buildDriverMatchConditions(
    driverIdentifier: string,
  ): Promise<any[]> {
    if (!driverIdentifier) return [];

    let driver: DriverDocument | null = null;
    if (isValidObjectId(driverIdentifier)) {
      driver = await this.driverModel
        .findById(driverIdentifier)
        .catch(() => null);
    }
    if (!driver) {
      const numId = Number(driverIdentifier);
      if (!isNaN(numId) && numId > 0) {
        driver = await this.driverModel.findOne({ driverId: numId });
      }
    }
    if (!driver) {
      const cleanMobile = String(driverIdentifier).replace(/\D/g, '');
      driver = await this.driverModel.findOne({
        $or: [
          { mobileNumber: String(driverIdentifier) },
          ...(cleanMobile && cleanMobile.length >= 7
            ? [{ mobileNumber: { $regex: cleanMobile, $options: 'i' } }]
            : []),
        ],
      });
    }

    const conditions: any[] = [];
    if (driver) {
      conditions.push({ driverId: driver._id.toString() });
      if (driver.driverId) {
        conditions.push({ driverId: String(driver.driverId) });
      }
      if (driver.mobileNumber) {
        conditions.push({ driverNumber: driver.mobileNumber });
        const cleanDigits = driver.mobileNumber.replace(/\D/g, '');
        if (cleanDigits && cleanDigits.length >= 7) {
          conditions.push({
            driverNumber: { $regex: cleanDigits, $options: 'i' },
          });
        }
      }
      if (driver.driverName) {
        conditions.push({
          driverName: {
            $regex: `^${driver.driverName.trim()}$`,
            $options: 'i',
          },
        });
      }
    } else {
      const cleanDigits = String(driverIdentifier).replace(/\D/g, '');
      conditions.push(
        { driverId: String(driverIdentifier) },
        { driverNumber: String(driverIdentifier) },
      );
      if (cleanDigits && cleanDigits.length >= 7) {
        conditions.push({
          driverNumber: { $regex: cleanDigits, $options: 'i' },
        });
      }
    }

    return conditions;
  }

  private async buildCustomerMatchConditions(
    customerIdentifier: string,
  ): Promise<any[]> {
    if (!customerIdentifier) return [];

    let customer: CustomerDocument | null = null;
    if (isValidObjectId(customerIdentifier)) {
      customer = await this.customerModel
        .findById(customerIdentifier)
        .catch(() => null);
    }
    if (!customer) {
      const numId = Number(customerIdentifier);
      if (!isNaN(numId) && numId > 0) {
        customer = await this.customerModel.findOne({ customerId: numId });
      }
    }
    if (!customer) {
      const cleanMobile = String(customerIdentifier).replace(/\D/g, '');
      customer = await this.customerModel.findOne({
        $or: [
          { mobileNumber: String(customerIdentifier) },
          { accountNumber: String(customerIdentifier) },
          ...(cleanMobile && cleanMobile.length >= 7
            ? [{ mobileNumber: { $regex: cleanMobile, $options: 'i' } }]
            : []),
        ],
      });
    }

    const conditions: any[] = [];
    if (customer) {
      if (customer.mobileNumber) {
        conditions.push({ customerNumber: customer.mobileNumber });
        const cleanDigits = customer.mobileNumber.replace(/\D/g, '');
        if (cleanDigits && cleanDigits.length >= 7) {
          conditions.push({
            customerNumber: { $regex: cleanDigits, $options: 'i' },
          });
        }
      }
      if (
        customer.accountNumber &&
        customer.accountNumber !== customer.mobileNumber
      ) {
        conditions.push({ customerNumber: customer.accountNumber });
      }
    } else {
      const cleanDigits = String(customerIdentifier).replace(/\D/g, '');
      conditions.push({ customerNumber: String(customerIdentifier) });
      if (cleanDigits && cleanDigits.length >= 7) {
        conditions.push({
          customerNumber: { $regex: cleanDigits, $options: 'i' },
        });
      }
    }

    return conditions;
  }

  async getRides(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      const andFilters: any[] = [];

      // 1. Driver-specific filter (supports driverId, driverNumber, driver)
      const driverParam = query.driverId || query.driverNumber || query.driver;
      if (driverParam) {
        const driverConditions = await this.buildDriverMatchConditions(
          String(driverParam),
        );
        if (driverConditions.length > 0) {
          andFilters.push({ $or: driverConditions });
        }
      }

      // 2. Customer-specific filter (supports customerId, customerNumber, customer)
      const customerParam =
        query.customerId || query.customerNumber || query.customer;
      if (customerParam) {
        const customerConditions = await this.buildCustomerMatchConditions(
          String(customerParam),
        );
        if (customerConditions.length > 0) {
          andFilters.push({ $or: customerConditions });
        }
      }

      // 3. Status filter (B5)
      const statusParam = query.status || query.rideStatus;
      if (statusParam) {
        const statusUpper = String(statusParam).trim().toUpperCase();
        if (statusUpper === 'PENDING' || statusUpper === 'WAITING') {
          andFilters.push({
            rideStatus: { $in: [RideStatus.PENDING, 'PENDING'] },
          });
        } else if (statusUpper === 'ACCEPTED') {
          andFilters.push({
            rideStatus: { $in: [RideStatus.ACCEPTED, 'ACCEPTED'] },
          });
        } else if (statusUpper === 'STARTED') {
          andFilters.push({
            rideStatus: { $in: [RideStatus.STARTED, 'STARTED'] },
          });
        } else if (statusUpper === 'PAYMENT_PENDING') {
          andFilters.push({
            rideStatus: { $in: [RideStatus.PAYMENT_PENDING, 'PAYMENT_PENDING'] },
          });
        } else if (statusUpper === 'IN_PROGRESS') {
          andFilters.push({
            rideStatus: {
              $in: [
                RideStatus.STARTED,
                RideStatus.PAYMENT_PENDING,
                'STARTED',
                'PAYMENT_PENDING',
              ],
            },
          });
        } else if (statusUpper === 'ONGOING') {
          andFilters.push({
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
        } else if (statusUpper === 'COMPLETED') {
          andFilters.push({
            rideStatus: { $in: [RideStatus.COMPLETED, 'COMPLETED'] },
          });
        } else if (statusUpper === 'CANCELLED') {
          andFilters.push({
            rideStatus: { $in: [RideStatus.CANCELLED, 'CANCELLED'] },
          });
        }
      }

      // 4. Queue / Direction filter (B5)
      const queueParam = query.queueName || query.queueType || query.queue;
      if (queueParam) {
        const queueUpper = String(queueParam).trim().toUpperCase();
        if (queueUpper === 'LOCAL' || queueUpper === '1') {
          andFilters.push({
            $or: [
              { queueName: { $in: ['LOCAL', 'LOCAL_RIDES', '1'] } },
              { customerSelectOption: '1' },
            ],
          });
        } else if (queueUpper === 'LONG_DISTANCE' || queueUpper === '2') {
          andFilters.push({
            $or: [
              { queueName: { $in: ['LONG_DISTANCE', 'LONG_DISTANCE_RIDE', '2'] } },
              { customerSelectOption: '2' },
            ],
          });
        }
      }

      // 5. General search filter (maintains exact backwards compatibility)
      if (query.search) {
        andFilters.push({
          $or: [
            { driverName: { $regex: query.search, $options: 'i' } },
            { customerNumber: { $regex: query.search, $options: 'i' } },
            { tripNumber: { $regex: query.search, $options: 'i' } },
          ],
        });
      }

      const searchFilter: any =
        andFilters.length > 1
          ? { $and: andFilters }
          : andFilters.length === 1
            ? andFilters[0]
            : {};

      // Concurrently calculate live operational counts
      const ongoingStatuses = [
        RideStatus.ACCEPTED,
        RideStatus.STARTED,
        RideStatus.PAYMENT_PENDING,
        'ACCEPTED',
        'STARTED',
        'PAYMENT_PENDING',
      ];

      const liveCountsPromise = (async () => {
        const [
          ongoingLocal,
          ongoingLong,
          totalOngoing,
          waitingForDriver,
          accepted,
          inProgress,
          completed,
          cancelled,
          totalRides,
        ] = await Promise.all([
          this.rideModel.countDocuments({
            rideStatus: { $in: ongoingStatuses },
            $or: [
              { queueName: { $in: ['LOCAL', 'LOCAL_RIDES', '1'] } },
              { customerSelectOption: '1' },
            ],
          }),
          this.rideModel.countDocuments({
            rideStatus: { $in: ongoingStatuses },
            $or: [
              { queueName: { $in: ['LONG_DISTANCE', 'LONG_DISTANCE_RIDE', '2'] } },
              { customerSelectOption: '2' },
            ],
          }),
          this.rideModel.countDocuments({
            rideStatus: { $in: ongoingStatuses },
          }),
          this.rideModel.countDocuments({
            rideStatus: { $in: [RideStatus.PENDING, 'PENDING'] },
          }),
          this.rideModel.countDocuments({
            rideStatus: { $in: [RideStatus.ACCEPTED, 'ACCEPTED'] },
          }),
          this.rideModel.countDocuments({
            rideStatus: {
              $in: [
                RideStatus.STARTED,
                RideStatus.PAYMENT_PENDING,
                'STARTED',
                'PAYMENT_PENDING',
              ],
            },
          }),
          this.rideModel.countDocuments({
            rideStatus: { $in: [RideStatus.COMPLETED, 'COMPLETED'] },
          }),
          this.rideModel.countDocuments({
            rideStatus: { $in: [RideStatus.CANCELLED, 'CANCELLED'] },
          }),
          this.rideModel.countDocuments(),
        ]);

        return {
          ongoingLocal,
          ongoingLongDistance: ongoingLong,
          totalOngoing,
          waitingForDriver,
          accepted,
          inProgress,
          completed,
          cancelled,
          totalRides,
        };
      })();

      const [total, rawData, liveCounts] = await Promise.all([
        this.rideModel.countDocuments(searchFilter),
        this.rideModel
          .find(searchFilter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        liveCountsPromise,
      ]);

      const data = rawData.map((ride: any) => ({
        ...ride,
        payment: ride.payment || null,
        paymentType: ride.paymentType || null,
        paymentStatus: ride.paymentStatus || PaymentStatus.PENDING,
      }));

      return new ApiResponse(
        200,
        {
          data,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
          liveCounts,
        },
        Msg.DATA_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getDriverRides(driverId: string, query: any) {
    return this.getRides({ ...query, driverId });
  }

  async getCustomerRides(customerId: string, query: any) {
    return this.getRides({ ...query, customerId });
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
        await axios.post(
          `${pythonUrl}/api/call-batch`,
          {
            tripNumber,
            batch1,
            batch2,
            batch3,
          },
          { timeout: 5000 },
        );
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

import { IvrService } from './ivr.service';
import { RideStatus } from '../../common/enums/ride/ride-enum';

describe('Self-Dispatch Guardrails', () => {
  let ivrService: IvrService;
  let mockDriverModel: any;
  let mockRideModel: any;
  let mockUserModel: any;
  let mockCustomerModel: any;
  let mockPricingService: any;
  let mockPaymentService: any;

  beforeEach(() => {
    mockDriverModel = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(null),
      }),
      updateMany: jest.fn().mockResolvedValue({}),
    };
    mockRideModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    mockUserModel = {};
    mockCustomerModel = {};
    mockPricingService = {};
    mockPaymentService = {};

    ivrService = new IvrService(
      mockDriverModel,
      mockRideModel,
      mockUserModel,
      mockCustomerModel,
      mockPricingService,
      mockPaymentService,
    );
    // Bypass self-heal background sweep during unit tests
    (ivrService as any).lastSelfHealTime = Date.now();
  });

  describe('IVR getOnlineBatches', () => {
    it('should exclude online driver whose phone matches caller customer number', async () => {
      mockDriverModel.find.mockResolvedValue([
        {
          driverId: 101,
          mobileNumber: '+18455378544',
          countryCode: '+1',
          batch: 1,
        },
        {
          driverId: 102,
          mobileNumber: '8451112222',
          countryCode: '+1',
          batch: 1,
        },
        {
          driverId: 103,
          mobileNumber: '8453334444',
          countryCode: '+1',
          batch: 2,
        },
      ]);

      const res: any = await ivrService.getOnlineBatches('LOCAL', '8455378544');

      expect(res.statusCode).toBe(200);
      const b1 = res.data.batches.batch1.drivers;
      const b2 = res.data.batches.batch2.drivers;

      // Driver 101 (8455378544) must NOT be in any batch
      expect(b1.some((d: any) => d.driverId === 101)).toBe(false);
      expect(b1.some((d: any) => d.driverId === 102)).toBe(true);
      expect(b2.some((d: any) => d.driverId === 103)).toBe(true);
      expect(res.data.batchSizes.b1).toBe(1);
      expect(res.data.batchSizes.b2).toBe(1);
    });
  });

  describe('IVR processDispatchAction', () => {
    it('should reject trip acceptance when driver phone matches customer phone', async () => {
      const driverObj = {
        _id: 'driver_obj_id_1',
        driverId: 101,
        mobileNumber: '8455378544',
        status: 'ACTIVE',
        isAvailable: true,
        save: jest.fn().mockResolvedValue(true),
      };
      mockDriverModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(driverObj),
      });

      const tripObj = {
        _id: 'trip_obj_id_1',
        tripNumber: 'TRIP-123456',
        customerNumber: '+18455378544', // Matching caller
        rideStatus: RideStatus.PENDING,
      };
      mockRideModel.findOne.mockResolvedValue(tripObj);

      const res: any = await ivrService.processDispatchAction({
        tripNumber: 'TRIP-123456',
        driverNumber: '8455378544',
        dtmfInput: '1',
      });

      expect(res.statusCode).toBe(400);
      expect(res.data.action).toBe('SAY_CANNOT_ACCEPT_OWN_TRIP');
      expect(mockRideModel.updateOne).not.toHaveBeenCalled();
    });

    it('should accept trip when driver phone differs from customer phone', async () => {
      const driverObj = {
        _id: 'driver_obj_id_1',
        driverId: 101,
        mobileNumber: '8451112222',
        status: 'ACTIVE',
        isAvailable: true,
        save: jest.fn().mockResolvedValue(true),
      };
      mockDriverModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(driverObj),
      });

      const tripObj = {
        _id: 'trip_obj_id_1',
        tripNumber: 'TRIP-123456',
        customerNumber: '8455378544', // Different customer
        rideStatus: RideStatus.PENDING,
      };
      mockRideModel.findOne.mockResolvedValue(tripObj);
      mockRideModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const res: any = await ivrService.processDispatchAction({
        tripNumber: 'TRIP-123456',
        driverNumber: '8451112222',
        dtmfInput: '1',
      });

      expect(res.statusCode).toBe(200);
      expect(res.data.action).toBe('SAY_ACCEPTED');
      expect(mockRideModel.updateOne).toHaveBeenCalledWith(
        { tripNumber: 'TRIP-123456', rideStatus: RideStatus.PENDING },
        {
          $set: {
            rideStatus: RideStatus.ACCEPTED,
            driverId: 'driver_obj_id_1',
          },
        },
      );
    });
  });
});

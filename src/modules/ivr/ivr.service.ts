import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IvrDispatchActionDto, IvrDriverActionDto } from './dto/ivr-action.dto';
import { Driver, DriverDocument } from '../driver/schema/driver.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { User, UserDocument } from '../user/schema/user.schema';
import { Customer, CustomerDocument } from '../customer/schema/customer.schema';
import { IvrDriverCardDto } from './dto/ivr-driver-card.dto';
import { PaymentStatus } from 'src/common/enums/payment/payment-status';
import { PaymentType } from 'src/common/enums/payment/payment-type';
import { ApiResponse } from '../../helpers/ApiResponse';
import { RideStatus } from 'src/common/enums/ride/ride-enum';

import axios from 'axios';
import { Msg } from 'src/helpers/responseMsg';

import { PricingService } from '../pricing/pricing.service';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class IvrService {
  constructor(
    @InjectModel(Driver.name) private driverModel: Model<DriverDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private pricingService: PricingService,
    private paymentService: PaymentService,
  ) {}

  async processDriverCard(dto: IvrDriverCardDto) {
    try {
      const callerNumber = dto.callerNumber || '';
      const numberDigits = callerNumber.replace(/\D/g, '');

      const driver = await this.driverModel.findOne({
        $or: [
          { mobileNumber: callerNumber },
          ...(numberDigits && numberDigits.length >= 7
            ? [{ mobileNumber: { $regex: numberDigits, $options: 'i' } }]
            : []),
        ],
      });

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const ride = await this.rideModel.findOne({ tripNumber: dto.tripNumber });
      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      // Connect with User and Customer
      const customerPhone = ride.customerNumber || '';
      const customerDigits = customerPhone.replace(/\D/g, '');

      let user: UserDocument | null = null;
      if (customerPhone) {
        user = await this.userModel.findOne({
          $or: [
            { phoneNumber: customerPhone },
            ...(customerDigits && customerDigits.length >= 7
              ? [{ phoneNumber: { $regex: customerDigits, $options: 'i' } }]
              : []),
          ],
        });
      }

      let customer: CustomerDocument | null = null;
      if (customerPhone) {
        customer = await this.customerModel.findOne({
          $or: [
            { mobileNumber: customerPhone },
            ...(customerDigits && customerDigits.length >= 7
              ? [{ mobileNumber: { $regex: customerDigits, $options: 'i' } }]
              : []),
          ],
        });
      }

      // PCI compliant masking
      const cleanCardNumber = dto.cardNumber.replace(/\D/g, '');
      const last4 = cleanCardNumber.slice(-4) || '****';
      const cardMasked = `**** **** **** ${last4}`;

      ride.payment = 'CARD';
      ride.paymentType = PaymentType.CREDIT_CARD;
      ride.cardLast4 = last4;
      ride.cardMasked = cardMasked;

      let paymentResult: any = null;

      // If expiration is provided and trip has an amount, attempt charging via USAePay
      if (dto.expiration && ride.rideAmount > 0) {
        try {
          const cardholderName =
            (user && `${user.firstName || ''} ${user.lastName || ''}`.trim()) ||
            customer?.fullName ||
            ride.customerName ||
            'Valued Customer';

          const chargeResponse = await this.paymentService.processCardSale({
            amount: ride.rideAmount,
            cardNumber: cleanCardNumber,
            expiration: dto.expiration,
            cvv: dto.cvv || '',
            cardholder: cardholderName,
            tripNumber: ride.tripNumber,
            rideId: ride._id.toString(),
          });

          if (chargeResponse && chargeResponse.statusCode === 200) {
            ride.paymentStatus = PaymentStatus.COMPLETED;
            ride.ridePaymentDateTime = new Date().toISOString();
            paymentResult = chargeResponse.data;
          } else {
            ride.paymentStatus = PaymentStatus.FAILED;
            paymentResult = chargeResponse?.data;
          }
        } catch (payErr) {
          console.log('Error while charging card via payment service in IVR:', payErr);
        }
      } else {
        if (ride.paymentStatus !== PaymentStatus.COMPLETED) {
          ride.paymentStatus = PaymentStatus.PENDING;
        }
      }

      if (customer) {
        customer.cardLast4 = last4;
        customer.cardBrand = 'Credit Card';
        await customer.save();
      }

      await ride.save();

      return new ApiResponse(
        200,
        {
          tripNumber: ride.tripNumber,
          driver: {
            _id: driver._id,
            driverId: driver.driverId,
            driverName: driver.driverName,
            mobileNumber: driver.mobileNumber,
          },
          ride: {
            _id: ride._id,
            rideId: ride.rideId,
            tripNumber: ride.tripNumber,
            customerNumber: ride.customerNumber,
            customerName: ride.customerName,
            rideAmount: ride.rideAmount,
            payment: ride.payment,
            paymentType: ride.paymentType,
            paymentStatus: ride.paymentStatus,
            cardMasked: ride.cardMasked,
            last4: ride.cardLast4,
          },
          user: user
            ? {
                _id: user._id,
                name:
                  `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
                  undefined,
                phoneNumber: user.phoneNumber,
                email: user.email,
                role: user.role,
              }
            : null,
          customer: customer
            ? {
                _id: customer._id,
                customerId: customer.customerId,
                fullName: customer.fullName,
                mobileNumber: customer.mobileNumber,
                cardLast4: customer.cardLast4,
              }
            : null,
          paymentResult,
        },
        Msg.DRIVER_CARD_PROCESSED,
      );
    } catch (error) {
      console.log('Error while processing driver card in IVR:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async processDriverAction(dto: IvrDriverActionDto) {
    const callerNumber =
      dto.callerNumber || dto.driverNumber || dto.phoneNumber || '';
    const numberDigits = callerNumber.replace(/\D/g, '');

    const driver = await this.driverModel.findOne({
      $or: [
        { mobileNumber: callerNumber },
        ...(numberDigits && numberDigits.length >= 7
          ? [{ mobileNumber: { $regex: numberDigits, $options: 'i' } }]
          : []),
      ],
    });

    if (!driver) {
      return new ApiResponse(
        403,
        { action: 'HANGUP' },
        Msg.DRIVER_UNRECOGNIZED,
      );
    }

    // Locate active ride
    let activeRide: RideDocument | null = null;
    if (driver.activeRideId) {
      activeRide = await this.rideModel.findById(driver.activeRideId);
    }

    if (!activeRide) {
      activeRide = await this.rideModel
        .findOne({
          $or: [
            { driverId: driver._id.toString() },
            { driverId: String(driver.driverId) },
            { driverNumber: driver.mobileNumber },
          ],
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
        })
        .sort({ createdAt: -1 });

      if (activeRide) {
        driver.activeRideId = activeRide._id.toString();
        driver.isAvailable = false;
        await driver.save();
      }
    }

    // 1. Explicit Trip Cancellation check - must NEVER trigger Fare Override
    const isCancelAction =
      dto.action === 'CANCEL_TRIP' ||
      dto.action === 'CANCEL' ||
      dto.action === 'TRIP_CANCEL';

    if (isCancelAction) {
      if (activeRide) {
        activeRide.rideStatus = RideStatus.CANCELLED;
        await activeRide.save();
        await this.cancelOtherCalls(activeRide.tripNumber);
      }

      driver.activeRideId = '';
      driver.isAvailable = true;
      await driver.save();

      return new ApiResponse(
        200,
        {
          action: 'TRIP_CANCELLED',
          tripNumber: activeRide ? activeRide.tripNumber : null,
          workflowStage: 'CANCELLED',
          rideStatus: 'CANCELLED',
        },
        'Trip cancelled successfully',
      );
    }

    // Check if this action is an override request (ONLY if not cancelling)
    const isOverrideAction =
      dto.action === 'OVERRIDE_FARE' ||
      dto.action === 'OVERRIDE' ||
      ((dto.overrideAmountCents !== undefined ||
        dto.amountCents !== undefined ||
        dto.overrideAmount !== undefined ||
        dto.amount !== undefined) &&
        !dto.action);

    const hasOverrideDigits =
      activeRide &&
      activeRide.paymentType === 'OVERRIDE' &&
      dto.dtmfInput &&
      dto.dtmfInput.length >= 2 &&
      /^\d+/.test(dto.dtmfInput.replace(/#/g, ''));

    if (isOverrideAction || hasOverrideDigits) {
      return this.handleFareOverride(driver, activeRide, dto);
    }

    if (activeRide) {
      if (!dto.dtmfInput) {
        if (activeRide.rideStatus === RideStatus.ACCEPTED) {
          return new ApiResponse(
            200,
            { menu: 'START_OR_CANCEL' },
            'Play start/cancel menu',
          );
        } else if (activeRide.rideStatus === RideStatus.STARTED) {
          return new ApiResponse(200, { menu: 'FINISH' }, 'Play finish menu');
        } else if (activeRide.rideStatus === RideStatus.PAYMENT_PENDING) {
          return new ApiResponse(
            200,
            { menu: 'PAYMENT_OPTIONS' },
            'Play payment options menu: 1-Cash, 2-Card, 3-Account, 4-Override',
          );
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
          await activeRide.save();
          await driver.save();
          return new ApiResponse(
            200,
            { action: 'PLAY_ZONE_MENU', menu: 'ZONE_SELECTION' },
            'Trip finished. Please select Zone: 1 for Zone 1, 2 for Zone 2, 3 for Zone 3, 4 for Zone 4.',
          );
        } else if (activeRide.rideStatus === RideStatus.PAYMENT_PENDING) {
          // If Zone has not been selected yet, driver is selecting Zone (1, 2, 3, or 4)
          if (!activeRide.selectedZone) {
            let durationMinutes = 0;
            if (
              activeRide.rideStartDateTime &&
              activeRide.rideCompleteDateTime
            ) {
              const start = new Date(activeRide.rideStartDateTime).getTime();
              const end = new Date(activeRide.rideCompleteDateTime).getTime();
              durationMinutes = Math.ceil((end - start) / 60000);
            }

            const fareDetails = await this.pricingService.calculateZoneFare(
              dto.dtmfInput,
              durationMinutes,
              activeRide.rideStartDateTime,
            );

            activeRide.selectedZone = fareDetails.zone;
            activeRide.rideAmount = fareDetails.calculatedFare;
            activeRide.originalCalculatedFare = fareDetails.calculatedFare;
            await activeRide.save();

            return new ApiResponse(
              200,
              {
                action: 'PLAY_PAYMENT_MENU',
                menu: 'PAYMENT_OPTIONS',
                durationMinutes,
                calculatedFare: fareDetails.calculatedFare,
                selectedZone: fareDetails.zone,
                currency: fareDetails.currency,
              },
              `Trip duration is ${durationMinutes} minutes. Calculated fare is $${fareDetails.calculatedFare}. Please select payment option: 1 for Cash, 2 for Credit Card, 3 for Customer Account, 4 for Override Amount, 0 to Go Back.`,
            );
          }

          if (dto.dtmfInput === '1') {
            activeRide.paymentType = 'CASH';
            activeRide.paymentStatus = 'COMPLETED';
            activeRide.rideStatus = RideStatus.COMPLETED;
            
            driver.activeRideId = '';
            driver.isAvailable = true;
            driver.ongoingRides = 'NO';
            driver.lastTripTaken = new Date();
            driver.earningsWithCash = (driver.earningsWithCash || 0) + (activeRide.rideAmount || 0);
            driver.totalEarnings = (driver.earningsWithCash || 0) + (driver.earningsWithoutCash || 0);

            await activeRide.save();
            await driver.save();
            return new ApiResponse(
              200,
              { action: 'SAY_PAYMENT_CASH_SUCCESS' },
              Msg.RIDE_COMPLETED,
            );
          } else if (dto.dtmfInput === '2') {
            activeRide.paymentType = 'CREDIT_CARD';
            activeRide.paymentStatus = 'COMPLETED';
            activeRide.rideStatus = RideStatus.COMPLETED;
            
            driver.activeRideId = '';
            driver.isAvailable = true;
            driver.ongoingRides = 'NO';
            driver.lastTripTaken = new Date();
            driver.earningsWithoutCash = (driver.earningsWithoutCash || 0) + (activeRide.rideAmount || 0);
            driver.totalEarnings = (driver.earningsWithCash || 0) + (driver.earningsWithoutCash || 0);

            await activeRide.save();
            await driver.save();
            return new ApiResponse(
              200,
              { action: 'SAY_PAYMENT_CARD_SUCCESS' },
              Msg.RIDE_COMPLETED,
            );
          } else if (dto.dtmfInput === '3') {
            activeRide.paymentType = 'CUSTOMER_ACCOUNT';
            
            // Trigger USAePay charge via customer account
            await this.paymentService.chargeRideVault({
              tripNumber: activeRide.tripNumber,
              amount: activeRide.rideAmount,
            });

            activeRide.paymentStatus = 'COMPLETED';
            activeRide.rideStatus = RideStatus.COMPLETED;
            
            driver.activeRideId = '';
            driver.isAvailable = true;
            driver.ongoingRides = 'NO';
            driver.lastTripTaken = new Date();
            driver.earningsWithoutCash = (driver.earningsWithoutCash || 0) + (activeRide.rideAmount || 0);
            driver.totalEarnings = (driver.earningsWithCash || 0) + (driver.earningsWithoutCash || 0);

            await activeRide.save();
            await driver.save();
            return new ApiResponse(
              200,
              { action: 'SAY_PAYMENT_ACCOUNT_SUCCESS' },
              Msg.RIDE_COMPLETED,
            );
          } else if (dto.dtmfInput === '4') {
            activeRide.paymentType = 'OVERRIDE';
            await activeRide.save();
            return new ApiResponse(
              200,
              { action: 'PROMPT_OVERRIDE_AMOUNT' },
              'Prompt driver for custom override amount',
            );
          } else if (dto.dtmfInput === '0') {
            return new ApiResponse(
              200,
              {
                action: 'PLAY_PAYMENT_MENU',
                menu: 'PAYMENT_OPTIONS',
                calculatedFare: activeRide.rideAmount,
                fareOverrideApplied: !!activeRide.fareOverrideApplied,
                currency: 'USD',
              },
              'Returned to payment menu',
            );
          }
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

  private async handleFareOverride(
    driver: DriverDocument,
    activeRide: RideDocument | null,
    dto: IvrDriverActionDto,
  ) {
    // 1. Validate driver is logged in
    if (!driver.isLoggedIn) {
      return new ApiResponse(
        409,
        { action: 'FARE_OVERRIDE_NOT_ALLOWED' },
        'Driver is not logged in',
      );
    }

    // 2. Validate active trip exists
    if (!activeRide) {
      return new ApiResponse(
        404,
        { action: 'NO_ACTIVE_TRIP' },
        Msg.NO_ACTIVE_TRIP,
      );
    }

    // 3. Validate trip belongs to this driver
    const isDriverMatch =
      activeRide.driverNumber === driver.mobileNumber ||
      activeRide.driverId === driver._id.toString() ||
      activeRide.driverId === String(driver.driverId);
    if (!isDriverMatch) {
      return new ApiResponse(
        409,
        { action: 'FARE_OVERRIDE_NOT_ALLOWED' },
        'Trip is assigned to another driver',
      );
    }

    // 4. Validate payment not already completed
    if (
      activeRide.paymentStatus === 'COMPLETED' ||
      activeRide.rideStatus === RideStatus.COMPLETED ||
      activeRide.rideStatus === 'COMPLETED'
    ) {
      return new ApiResponse(
        409,
        { action: 'PAYMENT_ALREADY_COMPLETED' },
        Msg.PAYMENT_ALREADY_COMPLETED,
      );
    }

    // 5. Validate trip is finished and awaiting payment
    if (
      activeRide.rideStatus !== RideStatus.PAYMENT_PENDING &&
      activeRide.rideStatus !== 'PAYMENT_PENDING'
    ) {
      return new ApiResponse(
        409,
        { action: 'FARE_OVERRIDE_NOT_ALLOWED' },
        Msg.FARE_OVERRIDE_NOT_ALLOWED,
      );
    }

    // 6. Validate zone/fare calculation has occurred
    if (
      !activeRide.selectedZone &&
      !activeRide.rideAmount &&
      !activeRide.originalCalculatedFare
    ) {
      return new ApiResponse(
        409,
        { action: 'FARE_OVERRIDE_NOT_ALLOWED' },
        'Trip zone and fare must be calculated before overriding',
      );
    }

    // 7. Extract override amount in integer cents
    let amountCents: number | null = null;
    if (dto.overrideAmountCents !== undefined && dto.overrideAmountCents !== null) {
      amountCents = Number(dto.overrideAmountCents);
    } else if (dto.amountCents !== undefined && dto.amountCents !== null) {
      amountCents = Number(dto.amountCents);
    } else if (dto.overrideAmount !== undefined && dto.overrideAmount !== null) {
      amountCents = Math.round(Number(dto.overrideAmount) * 100);
    } else if (dto.amount !== undefined && dto.amount !== null) {
      amountCents = Math.round(Number(dto.amount) * 100);
    } else if (dto.dtmfInput) {
      const cleanDigits = dto.dtmfInput.replace(/#/g, '').trim();
      if (/^\d+$/.test(cleanDigits)) {
        amountCents = Number(cleanDigits);
      }
    }

    // Validate amount: positive integer cents, reasonable cap (<= 100000 cents / $1000.00)
    if (
      amountCents === null ||
      isNaN(amountCents) ||
      amountCents <= 0 ||
      !Number.isInteger(amountCents) ||
      amountCents > 100000
    ) {
      return new ApiResponse(
        400,
        { action: 'FARE_OVERRIDE_INVALID' },
        Msg.FARE_OVERRIDE_INVALID,
      );
    }

    const newFareDollars = Number((amountCents / 100).toFixed(2));

    // 8. Idempotency Check: if identical override was already applied, return success
    if (
      activeRide.fareOverrideApplied &&
      activeRide.rideAmount === newFareDollars
    ) {
      return new ApiResponse(
        200,
        {
          action: 'FARE_OVERRIDE_SUCCESS',
          tripNumber: activeRide.tripNumber,
          workflowStage: 'AWAITING_PAYMENT',
          paymentStatus: 'PENDING',
          currency: 'USD',
          originalFareCents: Math.round(
            (activeRide.originalCalculatedFare || activeRide.rideAmount) * 100,
          ),
          fareCents: amountCents,
          fareOverrideApplied: true,
        },
        Msg.FARE_OVERRIDE_SUCCESS,
      );
    }

    // 9. Preserve original calculated fare if not already recorded
    if (!activeRide.originalCalculatedFare) {
      activeRide.originalCalculatedFare =
        activeRide.rideAmount || newFareDollars;
    }

    const originalFare = activeRide.originalCalculatedFare;
    activeRide.rideAmount = newFareDollars;
    activeRide.fareOverrideApplied = true;
    activeRide.fareOverrideAmount = newFareDollars;
    activeRide.fareOverrideDifference = Number(
      (newFareDollars - originalFare).toFixed(2),
    );
    activeRide.fareOverrideByDriverId = driver.driverId
      ? String(driver.driverId)
      : driver._id.toString();
    activeRide.fareOverrideAt = new Date();
    activeRide.paymentStatus = 'PENDING';
    activeRide.paymentType = 'OVERRIDE';
    activeRide.rideStatus = RideStatus.PAYMENT_PENDING;

    driver.activeRideId = activeRide._id.toString();
    driver.isAvailable = false;
    driver.ongoingRides = 'YES';

    await activeRide.save();
    await driver.save();

    return new ApiResponse(
      200,
      {
        action: 'FARE_OVERRIDE_SUCCESS',
        tripNumber: activeRide.tripNumber,
        workflowStage: 'AWAITING_PAYMENT',
        paymentStatus: 'PENDING',
        currency: 'USD',
        originalFareCents: Math.round(originalFare * 100),
        fareCents: amountCents,
        fareOverrideApplied: true,
      },
      Msg.FARE_OVERRIDE_SUCCESS,
    );
  }

  private dispatchLocks = new Map<
    string,
    { driverNumber: string; acceptedAt: Date }
  >();

  async processDispatchAction(dto: IvrDispatchActionDto) {
    const driver = await this.driverModel.findOne({
      mobileNumber: dto.driverNumber,
    });
    if (!driver) return new ApiResponse(403, {}, Msg.DRIVER_NOT_FOUND);

    if (!dto.dispatchId && !dto.tripNumber) {
      return new ApiResponse(
        400,
        {},
        'Either dispatchId or tripNumber is required',
      );
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
        const trip = await this.rideModel.findOne({
          tripNumber: dto.tripNumber,
        });
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

      const batch1Drivers = eligibleDrivers
        .filter((d) => d.batch === 1)
        .map(mapDriver);
      const batch2Drivers = eligibleDrivers
        .filter((d) => d.batch === 2)
        .map(mapDriver);
      const batch3Drivers = eligibleDrivers
        .filter((d) => d.batch === 3)
        .map(mapDriver);

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
      const numberDigits = (mobileNumber || '').replace(/\D/g, '');
      const driver = await this.driverModel.findOne({
        $or: [
          { mobileNumber },
          ...(numberDigits && numberDigits.length >= 7
            ? [{ mobileNumber: { $regex: numberDigits, $options: 'i' } }]
            : []),
        ],
      });

      if (!driver) {
        return new ApiResponse(
          404,
          { registered: false },
          Msg.DRIVER_NOT_FOUND,
        );
      }

      let workflowStage = 'IDLE';
      let activeTripData: any = null;

      let ride = driver.activeRideId
        ? await this.rideModel.findById(driver.activeRideId)
        : null;

      // If linked ride is not in an active workflow status, reset it
      if (
        ride &&
        ![
          RideStatus.ACCEPTED,
          RideStatus.STARTED,
          RideStatus.PAYMENT_PENDING,
          'ACCEPTED',
          'STARTED',
          'PAYMENT_PENDING',
        ].includes(ride.rideStatus as any)
      ) {
        ride = null;
        if (driver.activeRideId) {
          driver.activeRideId = '';
          driver.isAvailable = true;
          await driver.save();
        }
      }

      // Fallback: If activeRideId was not linked on driver, search by driverId or mobile number
      if (!ride) {
        ride = await this.rideModel
          .findOne({
            $or: [
              { driverId: driver._id.toString() },
              { driverId: String(driver.driverId) },
              { driverNumber: driver.mobileNumber },
            ],
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
          })
          .sort({ createdAt: -1 });

        // Auto-sync driver record if active ride is found
        if (ride) {
          driver.activeRideId = ride._id.toString();
          driver.isAvailable = false;
          await driver.save();
        }
      }

      if (ride) {
        const baseTripData = {
          tripId: ride._id,
          tripNumber: ride.tripNumber,
          customerName: ride.customerName || '',
          customerNumber: ride.customerNumber || '',
          queueName: ride.queueName || '',
          recordingUrl: ride.recordingUrl || '',
          rideStatus: ride.rideStatus || '',
          status: ride.rideStatus || '',
          rideStartDateTime: ride.rideStartDateTime || '',
          rideCompleteDateTime: ride.rideCompleteDateTime || '',
        };

        if (ride.rideStatus === RideStatus.ACCEPTED) {
          workflowStage = 'ASSIGNED_NOT_STARTED';
          activeTripData = {
            ...baseTripData,
            fareOverrideApplied: false,
          };
        } else if (ride.rideStatus === RideStatus.STARTED) {
          workflowStage = 'IN_PROGRESS';
          activeTripData = {
            ...baseTripData,
            fareOverrideApplied: false,
          };
        } else if (ride.rideStatus === RideStatus.PAYMENT_PENDING) {
          workflowStage = 'AWAITING_PAYMENT';

          let durationMinutes = 0;
          if (ride.rideStartDateTime && ride.rideCompleteDateTime) {
            const start = new Date(ride.rideStartDateTime).getTime();
            const end = new Date(ride.rideCompleteDateTime).getTime();
            durationMinutes = Math.ceil((end - start) / 60000);
          }

          let currency = 'USD';
          let baseFare = 0;
          let freeMinutes = 0;
          let baseTimeMinutes = 0;
          let perMinuteRate = 0;
          let extraMinutes = 0;
          let calculatedFare = ride.originalCalculatedFare || ride.rideAmount || 0;

          if (ride.selectedZone) {
            try {
              const fareDetails = await this.pricingService.calculateZoneFare(
                ride.selectedZone,
                durationMinutes,
                ride.rideStartDateTime,
              );
              currency = fareDetails.currency || 'USD';
              baseFare = fareDetails.baseFare;
              freeMinutes = fareDetails.freeMinutes;
              baseTimeMinutes = fareDetails.baseTimeMinutes;
              perMinuteRate = fareDetails.perMinuteRate;
              extraMinutes = fareDetails.extraMinutes;
              if (!ride.originalCalculatedFare && fareDetails.calculatedFare) {
                ride.originalCalculatedFare = fareDetails.calculatedFare;
                calculatedFare = fareDetails.calculatedFare;
                if (!ride.fareOverrideApplied) {
                  ride.rideAmount = fareDetails.calculatedFare;
                }
                await ride.save();
              }
            } catch (err) {
              console.log('Failed calculating zone fare for status', err.message);
            }
          }

          const originalFare = ride.originalCalculatedFare || calculatedFare;
          const currentFare =
            ride.rideAmount !== undefined && ride.rideAmount !== null
              ? ride.rideAmount
              : originalFare;
          const originalFareCents = Math.round(originalFare * 100);
          const fareCents = Math.round(currentFare * 100);

          activeTripData = {
            ...baseTripData,
            tripNumber: ride.tripNumber,
            status: ride.rideStatus,
            currency,
            durationMinutes,
            selectedZone: ride.selectedZone,
            baseFare,
            freeMinutes,
            baseTimeMinutes,
            perMinuteRate,
            extraMinutes,
            calculatedFare: originalFare,
            finalFare: currentFare,
            fareAmount: currentFare,
            originalFareCents,
            fareCents,
            fareOverrideApplied: !!ride.fareOverrideApplied,
          };
        }
      }

      const hasActiveTrip = !!ride && !!activeTripData;

      return new ApiResponse(
        200,
        {
          registered: true,
          driverId: driver.driverId || driver._id,
          driverName: driver.driverName,
          phoneNumber: driver.mobileNumber,
          loggedIn: driver.isLoggedIn,
          serviceType: driver.queueType,
          available: driver.isAvailable,
          workflowStage,
          activeTrip: hasActiveTrip,
          trip: hasActiveTrip ? activeTripData : null,
          activeTripData: activeTripData || null,
        },
        'Driver status fetched',
      );
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

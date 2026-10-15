import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
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
import { buildPhoneMatchConditions } from 'src/common/utils/phone-formatter.util';

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

  private async findDriverByPhoneNumber(
    rawPhone: string,
  ): Promise<DriverDocument | null> {
    if (!rawPhone) return null;
    const phoneConditions = buildPhoneMatchConditions(rawPhone, 'mobileNumber');
    return this.driverModel
      .findOne({ $or: phoneConditions })
      .sort({ createdAt: -1, _id: -1 });
  }

  async processDriverCard(dto: IvrDriverCardDto) {
    try {
      const callerNumber = dto.callerNumber || '';
      const driver = await this.findDriverByPhoneNumber(callerNumber);

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
            ride.rideStatus = RideStatus.COMPLETED;
            ride.ridePaymentDateTime = new Date().toISOString();
            ride.paymentTransactionId =
              chargeResponse.data?.transactionId || '';
            ride.paymentAuthCode = chargeResponse.data?.authCode || '';
            paymentResult = chargeResponse.data;

            // Credit driver upon successful card payment
            driver.activeRideId = '';
            driver.isAvailable = true;
            driver.ongoingRides = 'NO';
            driver.lastTripTaken = new Date();
            driver.earningsWithoutCash =
              (driver.earningsWithoutCash || 0) + (ride.rideAmount || 0);
            driver.totalEarnings =
              (driver.earningsWithCash || 0) +
              (driver.earningsWithoutCash || 0);
            await driver.save();
          } else {
            ride.paymentStatus = PaymentStatus.FAILED;
            ride.rideStatus = RideStatus.PAYMENT_PENDING;
            paymentResult = chargeResponse?.data;
          }
        } catch (payErr) {
          console.log(
            'Error while charging card via payment service in IVR:',
            payErr,
          );
          ride.paymentStatus = PaymentStatus.FAILED;
          ride.rideStatus = RideStatus.PAYMENT_PENDING;
        }
      } else {
        ride.paymentStatus = PaymentStatus.FAILED;
        ride.rideStatus = RideStatus.PAYMENT_PENDING;
      }

      if (customer) {
        customer.cardLast4 = last4;
        customer.cardBrand = 'Credit Card';
        await customer.save();
      }

      await ride.save();

      const isApproved = ride.paymentStatus === PaymentStatus.COMPLETED;

      return new ApiResponse(
        200,
        {
          action: isApproved
            ? 'SAY_PAYMENT_CARD_SUCCESS'
            : 'SAY_PAYMENT_FAILED',
          menu: isApproved ? undefined : 'PAYMENT_OPTIONS',
          tripNumber: ride.tripNumber,
          calculatedFare: ride.rideAmount,
          selectedZone: ride.selectedZone,
          currency: 'USD',
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
            rideStatus: ride.rideStatus,
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
        isApproved ? Msg.RIDE_COMPLETED : Msg.IVR_PAYMENT_DECLINED,
      );
    } catch (error) {
      console.log('Error while processing driver card in IVR:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  private isDriverBlocked(driver: DriverDocument): boolean {
    return driver.status === 'Block' || driver.status === 'INACTIVE';
  }

  async processDriverAction(dto: IvrDriverActionDto) {
    try {
      const callerNumber =
        dto.callerNumber || dto.driverNumber || dto.phoneNumber || '';
      const driver = await this.findDriverByPhoneNumber(callerNumber);

      if (!driver) {
        return new ApiResponse(
          403,
          { action: 'HANGUP' },
          Msg.DRIVER_UNRECOGNIZED,
        );
      }

      if (this.isDriverBlocked(driver) && !driver.activeRideId) {
        return new ApiResponse(
          403,
          { action: 'SAY_ACCOUNT_LOCKED' },
          Msg.IVR_DRIVER_ACCOUNT_LOCKED,
        );
      }

      // Locate active ride (prioritize explicit tripNumber if supplied)
      let activeRide: RideDocument | null = null;
      if (dto.tripNumber && typeof dto.tripNumber === 'string') {
        const foundTrip = await this.rideModel.findOne({
          tripNumber: dto.tripNumber.trim(),
        });
        if (foundTrip) {
          activeRide = foundTrip;
          if (
            !driver.activeRideId ||
            driver.activeRideId !== activeRide._id.toString()
          ) {
            driver.activeRideId = activeRide._id.toString();
            driver.isAvailable = false;
            driver.ongoingRides = 'YES';
            if (!driver.isLoggedIn) {
              driver.isLoggedIn = true;
              driver.loginLogout = 'START';
            }
            await driver.save();
          }
        }
      }

      const hasValidActiveRideId =
        !activeRide &&
        driver.activeRideId &&
        driver.activeRideId !== 'null' &&
        isValidObjectId(driver.activeRideId);

      if (hasValidActiveRideId) {
        activeRide = await this.rideModel.findById(driver.activeRideId);
        if (
          activeRide &&
          (activeRide.rideStatus === RideStatus.COMPLETED ||
            activeRide.rideStatus === 'COMPLETED' ||
            activeRide.rideStatus === RideStatus.CANCELLED ||
            activeRide.rideStatus === 'CANCELLED' ||
            activeRide.paymentStatus === PaymentStatus.COMPLETED ||
            activeRide.paymentStatus === 'COMPLETED')
        ) {
          driver.activeRideId = '';
          driver.isAvailable = true;
          driver.ongoingRides = 'NO';
          await driver.save();
          activeRide = null;
        }
      } else if (!activeRide && driver.activeRideId) {
        driver.activeRideId = '';
        await driver.save();
      }

      if (!activeRide) {
        const driverFilter = {
          $or: [
            { driverId: driver._id.toString() },
            { driverId: String(driver.driverId) },
            { driverNumber: driver.mobileNumber },
          ],
        };

        // Prioritize rides in progress or pending payment over newly assigned ACCEPTED rides
        activeRide = await this.rideModel
          .findOne({
            ...driverFilter,
            rideStatus: {
              $in: [
                RideStatus.PAYMENT_PENDING,
                RideStatus.STARTED,
                'PAYMENT_PENDING',
                'STARTED',
              ],
            },
          })
          .sort({ createdAt: -1 });

        if (!activeRide) {
          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
          activeRide = await this.rideModel
            .findOne({
              ...driverFilter,
              rideStatus: {
                $in: [RideStatus.ACCEPTED, 'ACCEPTED'],
              },
              createdAt: { $gte: fourHoursAgo },
            })
            .sort({ createdAt: -1 });
        }

        if (activeRide) {
          driver.activeRideId = activeRide._id.toString();
          driver.isAvailable = false;
          driver.ongoingRides = 'YES';
          if (!driver.isLoggedIn) {
            driver.isLoggedIn = true;
            driver.loginLogout = 'START';
          }
          await driver.save();
        }
      } else {
        if (!driver.isLoggedIn) {
          driver.isLoggedIn = true;
          driver.loginLogout = 'START';
        }
        driver.isAvailable = false;
        driver.ongoingRides = 'YES';
        await driver.save();
      }

      // 1. Explicit Trip Cancellation check - must NEVER trigger Fare Override
      const isCancelAction =
        dto.action === 'CANCEL_TRIP' ||
        dto.action === 'CANCEL' ||
        dto.action === 'TRIP_CANCEL';

      if (isCancelAction) {
        if (
          activeRide &&
          (activeRide.paymentStatus === PaymentStatus.COMPLETED ||
            activeRide.paymentStatus === 'COMPLETED' ||
            activeRide.rideStatus === RideStatus.COMPLETED ||
            activeRide.rideStatus === 'COMPLETED')
        ) {
          return new ApiResponse(
            400,
            {
              action: 'SAY_CANNOT_CANCEL',
              tripNumber: activeRide.tripNumber,
              rideStatus: activeRide.rideStatus,
              paymentStatus: activeRide.paymentStatus,
            },
            'Cannot cancel trip once payment has already been completed.',
          );
        }

        if (activeRide) {
          activeRide.rideStatus = RideStatus.CANCELLED;
          await activeRide.save();
          await this.cancelOtherCalls(activeRide.tripNumber);
        }

        driver.activeRideId = '';
        driver.isAvailable = true;
        driver.ongoingRides = 'NO';
        await driver.save();

        return new ApiResponse(
          200,
          {
            action: 'TRIP_CANCELLED',
            tripNumber: activeRide ? activeRide.tripNumber : null,
            workflowStage: 'CANCELLED',
            rideStatus: 'CANCELLED',
          },
          Msg.IVR_TRIP_CANCELLED,
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

      // Explicit Zone actions: CONFIRM_ZONE, CHANGE_ZONE, SELECT_ZONE, BACK_TO_ZONE
      const isZoneAction =
        dto.action === 'CONFIRM_ZONE' ||
        dto.action === 'CHANGE_ZONE' ||
        dto.action === 'SELECT_ZONE' ||
        (dto.zone !== undefined &&
          dto.zone !== null &&
          !isCancelAction &&
          !isOverrideAction);

      const isBackToZoneAction =
        dto.action === 'BACK_TO_ZONE' ||
        dto.action === 'BACK' ||
        dto.action === 'ZONE_MENU';

      if (activeRide && (isZoneAction || isBackToZoneAction)) {
        if (isBackToZoneAction) {
          return this.handleBackToZone(activeRide);
        }
        return this.handleZoneSelectionAndFare(
          driver,
          activeRide,
          dto.zone !== undefined && dto.zone !== null ? dto.zone : dto.dtmfInput,
        );
      }

      if (activeRide) {
        if (!dto.dtmfInput) {
          if (activeRide.rideStatus === RideStatus.ACCEPTED) {
            return new ApiResponse(
              200,
              { menu: 'START_OR_CANCEL' },
              Msg.IVR_PLAY_START_CANCEL_MENU,
            );
          } else if (activeRide.rideStatus === RideStatus.STARTED) {
            if (
              dto.action === 'FINISH' ||
              dto.action === 'FINISH_TRIP' ||
              dto.action === 'COMPLETE_TRIP'
            ) {
              activeRide.rideStatus = RideStatus.PAYMENT_PENDING;
              activeRide.rideCompleteDateTime = new Date().toISOString();
              if (driver) {
                activeRide.driverId = driver._id.toString();
                activeRide.driverNumber = driver.mobileNumber;
                activeRide.driverName = driver.driverName;
              }
              await activeRide.save();
              await driver.save();
              return new ApiResponse(
                200,
                {
                  action: 'SHOW_ZONE_MENU',
                  menu: 'ZONE_SELECTION',
                  workflowStage: 'ZONE_SELECTION',
                  tripNumber: activeRide.tripNumber,
                  rideStatus: 'PAYMENT_PENDING',
                  currency: 'USD',
                },
                Msg.IVR_PLAY_ZONE_SELECTION_MENU,
              );
            }
            return new ApiResponse(
              200,
              { menu: 'FINISH' },
              Msg.IVR_PLAY_FINISH_MENU,
            );
          } else if (activeRide.rideStatus === RideStatus.PAYMENT_PENDING) {
            if (!activeRide.selectedZone) {
              return new ApiResponse(
                200,
                {
                  action: 'PLAY_ZONE_MENU',
                  menu: 'ZONE_SELECTION',
                  workflowStage: 'ZONE_SELECTION',
                  tripNumber: activeRide.tripNumber,
                  tripId: activeRide._id,
                },
                Msg.IVR_PLAY_ZONE_SELECTION_MENU,
              );
            }
            return new ApiResponse(
              200,
              {
                action: 'PLAY_PAYMENT_MENU',
                menu: 'PAYMENT_OPTIONS',
                workflowStage: 'AWAITING_PAYMENT',
                tripNumber: activeRide.tripNumber,
                tripId: activeRide._id,
                calculatedFare: activeRide.rideAmount,
                selectedZone: activeRide.selectedZone,
                currency: 'USD',
              },
              Msg.IVR_PLAY_PAYMENT_OPTIONS_MENU,
            );
          }
        } else {
          if (
            activeRide.rideStatus === RideStatus.ACCEPTED &&
            dto.dtmfInput === '1'
          ) {
            activeRide.rideStatus = RideStatus.STARTED;
            activeRide.rideStartDateTime = new Date().toISOString();
            if (driver) {
              activeRide.driverId = driver._id.toString();
              activeRide.driverNumber = driver.mobileNumber;
              activeRide.driverName = driver.driverName;
            }
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
            driver.ongoingRides = 'NO';
            await activeRide.save();
            await driver.save();
            return new ApiResponse(
              200,
              { action: 'SAY_CANCELLED' },
              Msg.RIDE_CANCELLED,
            );
          } else if (
            activeRide.rideStatus === RideStatus.STARTED &&
            (dto.dtmfInput === '3' ||
              dto.dtmfInput === '9' ||
              dto.dtmfInput === '8')
          ) {
            activeRide.rideStatus = RideStatus.CANCELLED;
            await activeRide.save();
            await this.cancelOtherCalls(activeRide.tripNumber);
            driver.activeRideId = '';
            driver.isAvailable = true;
            driver.ongoingRides = 'NO';
            await driver.save();
            return new ApiResponse(
              200,
              {
                action: 'TRIP_CANCELLED',
                tripNumber: activeRide.tripNumber,
                workflowStage: 'CANCELLED',
                rideStatus: 'CANCELLED',
              },
              Msg.IVR_TRIP_CANCELLED_BEFORE_PAYMENT,
            );
          } else if (
            activeRide.rideStatus === RideStatus.STARTED &&
            (dto.dtmfInput === '2' ||
              dto.action === 'FINISH' ||
              dto.action === 'FINISH_TRIP' ||
              dto.action === 'COMPLETE_TRIP')
          ) {
            activeRide.rideStatus = RideStatus.PAYMENT_PENDING;
            activeRide.rideCompleteDateTime = new Date().toISOString();
            if (driver) {
              activeRide.driverId = driver._id.toString();
              activeRide.driverNumber = driver.mobileNumber;
              activeRide.driverName = driver.driverName;
            }
            await activeRide.save();
            await driver.save();
            return new ApiResponse(
              200,
              {
                action: 'SHOW_ZONE_MENU',
                menu: 'ZONE_SELECTION',
                workflowStage: 'ZONE_SELECTION',
                tripNumber: activeRide.tripNumber,
                rideStatus: 'PAYMENT_PENDING',
                currency: 'USD',
              },
              Msg.IVR_PLAY_ZONE_SELECTION_MENU,
            );
          } else if (activeRide.rideStatus === RideStatus.PAYMENT_PENDING) {
            if (dto.dtmfInput === '0' || dto.dtmfInput === '*') {
              return this.handleBackToZone(activeRide);
            }

            // If Zone has not been selected yet, driver is selecting Zone (1, 2, 3, or 4)
            if (!activeRide.selectedZone) {
              if (
                dto.dtmfInput === '9' ||
                dto.dtmfInput === '8' ||
                dto.action === 'CANCEL_TRIP' ||
                dto.action === 'CANCEL'
              ) {
                activeRide.rideStatus = RideStatus.CANCELLED;
                await activeRide.save();
                await this.cancelOtherCalls(activeRide.tripNumber);
                driver.activeRideId = '';
                driver.isAvailable = true;
                driver.ongoingRides = 'NO';
                await driver.save();
                return new ApiResponse(
                  200,
                  {
                    action: 'TRIP_CANCELLED',
                    tripNumber: activeRide.tripNumber,
                    workflowStage: 'CANCELLED',
                    rideStatus: 'CANCELLED',
                  },
                  Msg.IVR_TRIP_CANCELLED_BEFORE_PAYMENT,
                );
              }

              if (!['1', '2', '3', '4'].includes(dto.dtmfInput)) {
                return new ApiResponse(
                  200,
                  {
                    action: 'SHOW_ZONE_MENU',
                    menu: 'ZONE_SELECTION',
                    workflowStage: 'ZONE_SELECTION',
                    tripNumber: activeRide.tripNumber,
                    rideStatus: 'PAYMENT_PENDING',
                    currency: 'USD',
                  },
                  Msg.IVR_PLAY_ZONE_SELECTION_MENU,
                );
              }

              return this.handleZoneSelectionAndFare(
                driver,
                activeRide,
                dto.dtmfInput,
              );
            }

            if (
              dto.dtmfInput === '1' ||
              dto.action === 'PAY_CASH' ||
              dto.action === 'CASH'
            ) {
              activeRide.paymentType = PaymentType.CASH;
              activeRide.paymentStatus = PaymentStatus.COMPLETED;
              activeRide.rideStatus = RideStatus.COMPLETED;
              activeRide.ridePaymentDateTime = new Date().toISOString();

              driver.activeRideId = '';
              driver.isAvailable = true;
              driver.ongoingRides = 'NO';
              driver.lastTripTaken = new Date();
              driver.earningsWithCash =
                (driver.earningsWithCash || 0) + (activeRide.rideAmount || 0);
              driver.totalEarnings =
                (driver.earningsWithCash || 0) +
                (driver.earningsWithoutCash || 0);

              await activeRide.save();
              await driver.save();
              await this.paymentService.logCashPayment(
                activeRide,
                activeRide.rideAmount,
              );
              return new ApiResponse(
                200,
                {
                  action: 'SAY_PAYMENT_CASH_SUCCESS',
                  tripNumber: activeRide.tripNumber,
                  rideStatus: 'COMPLETED',
                  workflowStage: 'COMPLETED',
                  selectedZone: activeRide.selectedZone
                    ? parseInt(String(activeRide.selectedZone).replace(/\D/g, '')) || activeRide.selectedZone
                    : null,
                  zone: activeRide.selectedZone,
                  fare: activeRide.rideAmount,
                  calculatedFare: activeRide.rideAmount,
                  currency: 'USD',
                },
                Msg.RIDE_COMPLETED,
              );
            } else if (
              dto.dtmfInput === '2' ||
              dto.action === 'PAY_CARD' ||
              dto.action === 'CARD' ||
              dto.action === 'CREDIT_CARD'
            ) {
              activeRide.paymentType = PaymentType.CREDIT_CARD;
              await activeRide.save();
              return new ApiResponse(
                200,
                {
                  action: 'PROMPT_CARD_DETAILS',
                  menu: 'CARD_ENTRY',
                  workflowStage: 'AWAITING_CARD_DETAILS',
                  tripNumber: activeRide.tripNumber,
                  rideStatus: 'PAYMENT_PENDING',
                  calculatedFare: activeRide.rideAmount,
                  fare: activeRide.rideAmount,
                  selectedZone: activeRide.selectedZone
                    ? parseInt(String(activeRide.selectedZone).replace(/\D/g, '')) || activeRide.selectedZone
                    : null,
                  zone: activeRide.selectedZone,
                  currency: 'USD',
                },
                Msg.IVR_ENTER_CARD_DETAILS,
              );
            } else if (dto.dtmfInput === '3') {
              const customerPhone = activeRide.customerNumber || '';
              const customer = customerPhone
                ? await this.findCustomerByPhoneNumber(customerPhone)
                : null;
              const fareAmount = activeRide.rideAmount || 0;

              if (!customer) {
                activeRide.paymentType = PaymentType.CUSTOMER_ACCOUNT;
                activeRide.paymentStatus = PaymentStatus.FAILED;
                await activeRide.save();

                return new ApiResponse(
                  200,
                  {
                    action: 'SAY_PAYMENT_FAILED',
                    menu: 'PAYMENT_OPTIONS',
                    calculatedFare: activeRide.rideAmount,
                    fareOverrideApplied: !!activeRide.fareOverrideApplied,
                    currency: 'USD',
                    error: 'Customer account not found for this phone number.',
                  },
                  Msg.IVR_CUSTOMER_ACCOUNT_NOT_FOUND,
                );
              }

              // Step 1: Check if customer has enough prepaid money/balance on account
              if ((customer.credit || 0) >= fareAmount && fareAmount >= 0) {
                customer.credit = Number(
                  ((customer.credit || 0) - fareAmount).toFixed(2),
                );
                await customer.save();

                activeRide.paymentType = PaymentType.CUSTOMER_ACCOUNT;
                activeRide.paymentStatus = PaymentStatus.COMPLETED;
                activeRide.rideStatus = RideStatus.COMPLETED;
                activeRide.ridePaymentDateTime = new Date().toISOString();

                driver.activeRideId = '';
                driver.isAvailable = true;
                driver.ongoingRides = 'NO';
                driver.lastTripTaken = new Date();
                driver.earningsWithoutCash =
                  (driver.earningsWithoutCash || 0) + fareAmount;
                driver.totalEarnings =
                  (driver.earningsWithCash || 0) +
                  (driver.earningsWithoutCash || 0);

                await activeRide.save();
                await driver.save();

                await this.paymentService.logAccountBalancePayment(
                  activeRide,
                  fareAmount,
                  customer.credit,
                );

                return new ApiResponse(
                  200,
                  {
                    action: 'SAY_PAYMENT_ACCOUNT_SUCCESS',
                    remainingBalance: customer.credit,
                    paidVia: 'PREPAID_BALANCE',
                  },
                  Msg.IVR_ACCOUNT_BALANCE_SUCCESS(customer.credit),
                );
              }

              // Step 2: If insufficient prepaid balance, check if customer has a valid credit card linked/on file
              if (customer.usaepayCustomerId) {
                const vaultResult = await this.paymentService.chargeRideVault({
                  tripNumber: activeRide.tripNumber,
                  amount: fareAmount,
                  customerId: customer.usaepayCustomerId,
                });

                if (
                  vaultResult &&
                  vaultResult.statusCode === 200 &&
                  (vaultResult.data?.status === 'Approved' ||
                    vaultResult.data?.alreadyPaid)
                ) {
                  activeRide.paymentType = PaymentType.SAVED_CARD;
                  activeRide.paymentStatus = PaymentStatus.COMPLETED;
                  activeRide.rideStatus = RideStatus.COMPLETED;
                  activeRide.ridePaymentDateTime =
                    activeRide.ridePaymentDateTime || new Date().toISOString();

                  driver.activeRideId = '';
                  driver.isAvailable = true;
                  driver.ongoingRides = 'NO';
                  driver.lastTripTaken = new Date();
                  driver.earningsWithoutCash =
                    (driver.earningsWithoutCash || 0) + fareAmount;
                  driver.totalEarnings =
                    (driver.earningsWithCash || 0) +
                    (driver.earningsWithoutCash || 0);

                  await activeRide.save();
                  await driver.save();

                  return new ApiResponse(
                    200,
                    {
                      action: 'SAY_PAYMENT_ACCOUNT_SUCCESS',
                      paidVia: 'CARD_ON_FILE',
                    },
                    Msg.IVR_CARD_ON_FILE_PAYMENT_SUCCESS,
                  );
                }

                // Card on file was declined by gateway
                activeRide.paymentType = PaymentType.CUSTOMER_ACCOUNT;
                activeRide.paymentStatus = PaymentStatus.FAILED;
                await activeRide.save();

                return new ApiResponse(
                  200,
                  {
                    action: 'SAY_PAYMENT_FAILED',
                    menu: 'PAYMENT_OPTIONS',
                    calculatedFare: activeRide.rideAmount,
                    fareOverrideApplied: !!activeRide.fareOverrideApplied,
                    currency: 'USD',
                    error: vaultResult?.message || 'Card on file was declined',
                  },
                  Msg.IVR_CARD_ON_FILE_DECLINED,
                );
              }

              // Step 3: Neither prepaid balance nor a card on file is available
              activeRide.paymentType = PaymentType.CUSTOMER_ACCOUNT;
              activeRide.paymentStatus = PaymentStatus.FAILED;
              await activeRide.save();

              return new ApiResponse(
                200,
                {
                  action: 'SAY_PAYMENT_FAILED',
                  menu: 'PAYMENT_OPTIONS',
                  calculatedFare: activeRide.rideAmount,
                  fareOverrideApplied: !!activeRide.fareOverrideApplied,
                  currency: 'USD',
                  error:
                    'Customer does not have a linked credit card or sufficient account balance.',
                },
                Msg.IVR_NO_VALID_CARD_OR_BALANCE,
              );
            } else if (dto.dtmfInput === '4') {
              activeRide.paymentType = 'OVERRIDE';
              await activeRide.save();
              return new ApiResponse(
                200,
                { action: 'PROMPT_OVERRIDE_AMOUNT' },
                Msg.IVR_PROMPT_OVERRIDE_AMOUNT,
              );
            } else if (dto.dtmfInput === '9' || dto.dtmfInput === '8') {
              activeRide.rideStatus = RideStatus.CANCELLED;
              await activeRide.save();
              await this.cancelOtherCalls(activeRide.tripNumber);

              driver.activeRideId = '';
              driver.isAvailable = true;
              driver.ongoingRides = 'NO';
              await driver.save();

              return new ApiResponse(
                200,
                {
                  action: 'TRIP_CANCELLED',
                  tripNumber: activeRide.tripNumber,
                  workflowStage: 'CANCELLED',
                  rideStatus: 'CANCELLED',
                },
                Msg.IVR_TRIP_CANCELLED,
              );
            } else if (dto.dtmfInput === '0' || dto.dtmfInput === '*') {
              return this.handleBackToZone(activeRide);
            } else {
              return new ApiResponse(
                200,
                {
                  action: 'PLAY_PAYMENT_MENU',
                  menu: 'PAYMENT_OPTIONS',
                  workflowStage: 'AWAITING_PAYMENT',
                  tripNumber: activeRide.tripNumber,
                  tripId: activeRide._id,
                  calculatedFare: activeRide.rideAmount,
                  fareOverrideApplied: !!activeRide.fareOverrideApplied,
                  selectedZone: activeRide.selectedZone,
                  currency: 'USD',
                },
                Msg.IVR_PLAY_PAYMENT_OPTIONS_MENU,
              );
            }
          }
        }
      } else {
        const normalizedAction = (dto.action || '').toUpperCase().trim();
        const input = (dto.dtmfInput || '').trim();

        if (!input && !normalizedAction) {
          return new ApiResponse(
            200,
            {
              action: 'PLAY_LOGIN_MENU',
              menu: 'LOGIN_LOGOUT',
              workflowStage: driver.isLoggedIn ? 'LOGGED_IN' : 'IDLE',
              isLoggedIn: driver.isLoggedIn,
              queueType: driver.queueType,
            },
            Msg.IVR_PLAY_LOGIN_MENU,
          );
        }

        if (this.isDriverBlocked(driver)) {
          return new ApiResponse(
            403,
            { action: 'SAY_ACCOUNT_LOCKED' },
            Msg.IVR_DRIVER_ACCOUNT_LOCKED,
          );
        }

        const isLogout =
          input === '4' ||
          normalizedAction === 'LOGOUT' ||
          normalizedAction === 'STOP';

        const isLoginLocal =
          input === '1' ||
          normalizedAction === 'LOGIN_LOCAL' ||
          normalizedAction === 'LOCAL';

        const isLoginLongDistance =
          input === '2' ||
          normalizedAction === 'LOGIN_LONG_DISTANCE' ||
          normalizedAction === 'LONG_DISTANCE';

        const isLoginBoth =
          input === '3' ||
          normalizedAction === 'LOGIN_BOTH' ||
          normalizedAction === 'BOTH';

        const isGenericLogin =
          normalizedAction === 'LOGIN' || normalizedAction === 'START';

        if (isLogout) {
          driver.isLoggedIn = false;
          driver.isAvailable = false;
          driver.loginLogout = 'STOP';
          await driver.save();
          return new ApiResponse(
            200,
            {
              action: 'SAY_LOGGED_OUT',
              menu: 'LOGIN_LOGOUT',
              workflowStage: 'IDLE',
              isLoggedIn: false,
            },
            Msg.USER_LOGGED_OUT,
          );
        } else if (isLoginLocal) {
          driver.isLoggedIn = true;
          driver.isAvailable = true;
          driver.queueType = 'LOCAL';
          driver.assignQueue = 'Local_Rides';
          driver.loginLogout = 'START';
          await driver.save();
          return new ApiResponse(
            200,
            {
              action: 'SAY_LOGGED_IN',
              queueType: 'LOCAL',
              workflowStage: 'LOGGED_IN',
              isLoggedIn: true,
            },
            Msg.USER_LOGIN,
          );
        } else if (isLoginLongDistance) {
          driver.isLoggedIn = true;
          driver.isAvailable = true;
          driver.queueType = 'LONG_DISTANCE';
          driver.assignQueue = 'Long_Distance_Ride';
          driver.loginLogout = 'START';
          await driver.save();
          return new ApiResponse(
            200,
            {
              action: 'SAY_LOGGED_IN',
              queueType: 'LONG_DISTANCE',
              workflowStage: 'LOGGED_IN',
              isLoggedIn: true,
            },
            Msg.USER_LOGIN,
          );
        } else if (isLoginBoth || isGenericLogin) {
          driver.isLoggedIn = true;
          driver.isAvailable = true;
          driver.queueType = 'BOTH';
          driver.assignQueue = 'BOTH';
          driver.loginLogout = 'START';
          await driver.save();
          return new ApiResponse(
            200,
            {
              action: 'SAY_LOGGED_IN',
              queueType: 'BOTH',
              workflowStage: 'LOGGED_IN',
              isLoggedIn: true,
            },
            Msg.USER_LOGIN,
          );
        }
      }

      return new ApiResponse(
        200,
        { action: 'INVALID_INPUT' },
        Msg.INVALID_INPUT,
      );
    } catch (error) {
      console.error('Error in processDriverAction:', error);
      return new ApiResponse(
        500,
        { action: 'PLAY_PAYMENT_MENU', menu: 'PAYMENT_OPTIONS' },
        Msg.SERVER_ERROR,
      );
    }
  }

  private async handleZoneSelectionAndFare(
    driver: DriverDocument,
    activeRide: RideDocument,
    rawZone: any,
  ) {
    if (rawZone === undefined || rawZone === null || rawZone === '') {
      return new ApiResponse(
        200,
        {
          action: 'SHOW_ZONE_MENU',
          menu: 'ZONE_SELECTION',
          workflowStage: 'ZONE_SELECTION',
          tripNumber: activeRide.tripNumber,
          tripId: activeRide._id,
        },
        Msg.IVR_PLAY_ZONE_SELECTION_MENU,
      );
    }

    let numericZone = 1;
    if (typeof rawZone === 'number') {
      numericZone = rawZone;
    } else {
      const digits = String(rawZone).replace(/\D/g, '');
      numericZone = digits ? parseInt(digits, 10) : 1;
    }

    if (!activeRide.rideCompleteDateTime) {
      activeRide.rideCompleteDateTime = new Date().toISOString();
    }

    let durationMinutes = 0;
    if (activeRide.rideStartDateTime && activeRide.rideCompleteDateTime) {
      const start = new Date(activeRide.rideStartDateTime).getTime();
      const end = new Date(activeRide.rideCompleteDateTime).getTime();
      durationMinutes = Math.max(0, Math.ceil((end - start) / 60000));
    }

    const fareDetails = await this.pricingService.calculateZoneFare(
      String(rawZone),
      durationMinutes,
      activeRide.rideStartDateTime,
    );

    activeRide.selectedZone = fareDetails.zone;
    activeRide.rideAmount = fareDetails.calculatedFare;
    activeRide.calculatedFare = fareDetails.calculatedFare;
    activeRide.originalCalculatedFare = fareDetails.calculatedFare;
    activeRide.fareCalculatedAt = new Date();
    activeRide.fareOverrideApplied = false;
    (activeRide as any).fareOverrideAmount = undefined;
    (activeRide as any).fareOverrideDifference = undefined;
    activeRide.rideStatus = RideStatus.PAYMENT_PENDING;
    activeRide.paymentStatus = PaymentStatus.PENDING;
    (activeRide as any).paymentType = undefined;

    if (driver) {
      activeRide.driverId = driver._id.toString();
      activeRide.driverNumber = driver.mobileNumber;
      activeRide.driverName = driver.driverName;
    }

    await activeRide.save();

    return new ApiResponse(
      200,
      {
        tripNumber: activeRide.tripNumber,
        rideStatus: 'PAYMENT_PENDING',
        workflowStage: 'AWAITING_PAYMENT',
        selectedZone: typeof rawZone === 'number' ? rawZone : numericZone,
        zone: fareDetails.zone,
        fare: fareDetails.calculatedFare,
        calculatedFare: fareDetails.calculatedFare,
        durationMinutes,
        currency: fareDetails.currency || 'USD',
        action: 'SAY_FARE_AND_PAYMENT_OPTIONS',
        menu: 'PAYMENT_OPTIONS',
      },
      'Zone confirmed and fare calculated successfully',
    );
  }

  private async handleBackToZone(activeRide: RideDocument) {
    let numericSelectedZone = 1;
    if (activeRide.selectedZone) {
      const digits = String(activeRide.selectedZone).replace(/\D/g, '');
      numericSelectedZone = digits ? parseInt(digits, 10) : 1;
    }

    // Reset any partial payment attempt
    if (activeRide.paymentStatus !== PaymentStatus.COMPLETED) {
      (activeRide as any).paymentType = undefined;
      activeRide.rideStatus = RideStatus.PAYMENT_PENDING;
      activeRide.paymentStatus = PaymentStatus.PENDING;
      await activeRide.save();
    }

    return new ApiResponse(
      200,
      {
        tripNumber: activeRide.tripNumber,
        rideStatus: 'PAYMENT_PENDING',
        workflowStage: 'ZONE_SELECTION',
        selectedZone: numericSelectedZone,
        zone: activeRide.selectedZone || 'ZONE 1',
        fare: activeRide.rideAmount || activeRide.calculatedFare || 0,
        calculatedFare: activeRide.calculatedFare || activeRide.rideAmount || 0,
        currency: 'USD',
        action: 'SHOW_ZONE_MENU',
        menu: 'ZONE_SELECTION',
      },
      'Returned to zone selection menu',
    );
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
        Msg.IVR_DRIVER_NOT_LOGGED_IN,
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
        Msg.IVR_TRIP_ASSIGNED_TO_OTHER_DRIVER,
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
        Msg.IVR_ZONE_FARE_REQUIRED_FOR_OVERRIDE,
      );
    }

    // 7. Extract override amount in integer cents
    let amountCents: number | null = null;
    if (
      dto.overrideAmountCents !== undefined &&
      dto.overrideAmountCents !== null
    ) {
      amountCents = Number(dto.overrideAmountCents);
    } else if (dto.amountCents !== undefined && dto.amountCents !== null) {
      amountCents = Number(dto.amountCents);
    } else if (
      dto.overrideAmount !== undefined &&
      dto.overrideAmount !== null
    ) {
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
    const driver = await this.findDriverByPhoneNumber(dto.driverNumber);
    if (!driver) return new ApiResponse(403, {}, Msg.DRIVER_NOT_FOUND);

    if (this.isDriverBlocked(driver)) {
      return new ApiResponse(
        403,
        { action: 'SAY_ACCOUNT_LOCKED' },
        Msg.IVR_DRIVER_ACCOUNT_LOCKED,
      );
    }

    if (!dto.dispatchId && !dto.tripNumber) {
      return new ApiResponse(400, {}, Msg.IVR_DISPATCH_OR_TRIP_REQUIRED);
    }

    // --- PRE-BOOKING DISPATCH FLOW (Using dispatchId) ---
    if (dto.dispatchId) {
      if (dto.dtmfInput === '1') {
        const cleanDriverPhone = (driver.mobileNumber || '')
          .replace(/\D/g, '')
          .slice(-10);
        const cleanCustomerPhone = (dto.customerNumber || '')
          .replace(/\D/g, '')
          .slice(-10);
        if (
          cleanDriverPhone &&
          cleanCustomerPhone &&
          cleanDriverPhone === cleanCustomerPhone
        ) {
          return new ApiResponse(
            400,
            { action: 'SAY_CANNOT_ACCEPT_OWN_TRIP' },
            Msg.IVR_CANNOT_ACCEPT_OWN_TRIP,
          );
        }

        // Guard: Prevent driver from taking a trip if they already have an active ride in progress
        if (driver.activeRideId) {
          const currentActiveRide = await this.rideModel.findById(driver.activeRideId);
          if (
            currentActiveRide &&
            [
              RideStatus.ACCEPTED,
              RideStatus.DRIVER_FOUND,
              RideStatus.DRIVER_ARRIVED,
              RideStatus.STARTED,
              RideStatus.ONGOING,
              'ACCEPTED',
              'DRIVER_FOUND',
              'DRIVER_ARRIVED',
              'STARTED',
              'ONGOING',
            ].includes(currentActiveRide.rideStatus)
          ) {
            return new ApiResponse(
              400,
              { action: 'SAY_ALREADY_ASSIGNED' },
              Msg.RIDE_ALREADY_ASSIGNED,
            );
          }
        }

        const existingLock = this.dispatchLocks.get(dto.dispatchId);
        if (existingLock) {
          if (existingLock.driverNumber === dto.driverNumber) {
            return new ApiResponse(
              200,
              {
                action: 'SAY_ACCEPTED',
                dispatchId: dto.dispatchId,
                driverNumber: dto.driverNumber,
                driverId: driver._id.toString(),
                rideStatus: RideStatus.ACCEPTED,
              },
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
          {
            action: 'SAY_ACCEPTED',
            dispatchId: dto.dispatchId,
            driverNumber: dto.driverNumber,
            driverId: driver._id.toString(),
            rideStatus: RideStatus.ACCEPTED,
          },
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
          Msg.IVR_REPLAY_REQUESTED,
        );
      }
    }

    // --- POST-BOOKING DISPATCH FLOW (Using tripNumber) ---
    if (dto.tripNumber) {
      if (dto.dtmfInput === '1') {
        const trip = await this.rideModel.findOne({
          tripNumber: dto.tripNumber,
        });

        if (!trip) {
          return new ApiResponse(
            404,
            { action: 'SAY_TRIP_NOT_FOUND' },
            Msg.RIDE_NOT_FOUND,
          );
        }

        const cleanDriverPhone = (driver.mobileNumber || '')
          .replace(/\D/g, '')
          .slice(-10);
        const cleanCustomerPhone = (trip.customerNumber || '')
          .replace(/\D/g, '')
          .slice(-10);

        if (
          cleanDriverPhone &&
          cleanCustomerPhone &&
          cleanDriverPhone === cleanCustomerPhone
        ) {
          return new ApiResponse(
            400,
            { action: 'SAY_CANNOT_ACCEPT_OWN_TRIP' },
            Msg.IVR_CANNOT_ACCEPT_OWN_TRIP,
          );
        }

        // Guard: Prevent driver from taking a trip if they already have an active ride in progress
        if (driver.activeRideId && driver.activeRideId !== trip._id.toString()) {
          const currentActiveRide = await this.rideModel.findById(driver.activeRideId);
          if (
            currentActiveRide &&
            [
              RideStatus.ACCEPTED,
              RideStatus.DRIVER_FOUND,
              RideStatus.DRIVER_ARRIVED,
              RideStatus.STARTED,
              RideStatus.ONGOING,
              'ACCEPTED',
              'DRIVER_FOUND',
              'DRIVER_ARRIVED',
              'STARTED',
              'ONGOING',
            ].includes(currentActiveRide.rideStatus)
          ) {
            return new ApiResponse(
              400,
              { action: 'SAY_ALREADY_ASSIGNED' },
              Msg.RIDE_ALREADY_ASSIGNED,
            );
          }
        }

        const result = await this.rideModel.updateOne(
          { tripNumber: dto.tripNumber, rideStatus: RideStatus.PENDING },
          {
            $set: {
              rideStatus: RideStatus.ACCEPTED,
              driverId: driver._id.toString(),
              driverName: driver.driverName,
              driverNumber: driver.mobileNumber,
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

        driver.activeRideId = trip._id.toString();
        driver.isAvailable = false;
        driver.ongoingRides = 'YES';
        await driver.save();

        this.cancelOtherCalls(dto.tripNumber).catch(console.error);

        return new ApiResponse(
          200,
          {
            action: 'SAY_ACCEPTED',
            tripNumber: dto.tripNumber,
            driverNumber: dto.driverNumber,
            driverId: driver._id.toString(),
            rideStatus: RideStatus.ACCEPTED,
          },
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
          Msg.IVR_REPLAY_REQUESTED,
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

  private lastSelfHealTime = 0;

  private async healStaleAndFinishedDriverRides(): Promise<void> {
    const now = Date.now();
    // Throttle self-healing sweep to run at most once every 10s to prevent database load
    if (now - this.lastSelfHealTime < 10000) return;
    this.lastSelfHealTime = now;

    try {
      // ONLY check drivers who are actively logged in, marked unavailable, AND actually have an activeRideId linked
      const stuckDrivers = await this.driverModel.find({
        isLoggedIn: true,
        isAvailable: false,
        activeRideId: { $exists: true, $ne: null, $nin: ['', 'null'] },
      });

      if (!stuckDrivers || stuckDrivers.length === 0) return;

      const activeRideIds = stuckDrivers
        .map((d) => d.activeRideId)
        .filter((id) => id && isValidObjectId(id));

      if (activeRideIds.length === 0) return;

      const foundRides = await this.rideModel
        .find({ _id: { $in: activeRideIds } })
        .select(
          '_id tripNumber rideStatus paymentStatus rideCompleteDateTime createdAt',
        )
        .lean();

      const ridesMap = new Map<string, any>();
      for (const r of foundRides) {
        ridesMap.set(r._id.toString(), r);
      }

      for (const driver of stuckDrivers) {
        const linkedRide = ridesMap.get(driver.activeRideId.toString());
        let shouldFree = false;

        // Ride document no longer exists
        if (!linkedRide) {
          shouldFree = true;
        } else if (
          linkedRide.rideStatus === RideStatus.COMPLETED ||
          linkedRide.rideStatus === 'COMPLETED' ||
          linkedRide.paymentStatus === 'COMPLETED' ||
          linkedRide.rideStatus === RideStatus.CANCELLED ||
          linkedRide.rideStatus === 'CANCELLED'
        ) {
          shouldFree = true;
        } else if (
          linkedRide.rideStatus === RideStatus.PAYMENT_PENDING ||
          linkedRide.rideStatus === 'PAYMENT_PENDING'
        ) {
          // Keep driver linked to settle payment, but auto-free if abandoned/stale (> 45 minutes)
          const ageMs = now - new Date(linkedRide.createdAt).getTime();
          shouldFree = ageMs > 45 * 60 * 1000;
        } else {
          // Stale check for active rides older than 45 minutes
          const ageMs = now - new Date(linkedRide.createdAt).getTime();
          if (ageMs > 45 * 60 * 1000) {
            shouldFree = true;
          }
        }

        if (shouldFree) {
          driver.activeRideId = '';
          driver.isAvailable = true;
          driver.ongoingRides = 'NO';
          // NEVER modify driver.isLoggedIn here!
          await driver.save();
        }
      }
    } catch (err) {
      console.error('Error in healStaleAndFinishedDriverRides:', err);
    }
  }

  private normalizeCountryCode(countryCode?: string | number): string {
    const cc = (countryCode || '').toString().trim();
    if (cc === '91' || cc === '+91' || cc.toLowerCase() === 'india') {
      return '+91';
    }
    if (cc === '1' || cc === '+1' || cc === '0' || !cc) {
      return '+1';
    }
    if (!cc.startsWith('+')) {
      return `+${cc}`;
    }
    return cc;
  }

  async getOnlineBatches(queueType?: string, callerNumber?: string) {
    try {
      // 1. Auto-heal any drivers whose rides completed, dropped off, or timed out
      await this.healStaleAndFinishedDriverRides();

      // 2. Query all active duty logged-in drivers
      const query: any = {
        $or: [
          { isLoggedIn: true },
          { loginLogout: { $in: ['START', 'LOGIN'] } },
        ],
        isAvailable: true,
        status: { $nin: ['Block', 'INACTIVE'] },
      };

      const cleanCaller = callerNumber
        ? callerNumber.replace(/\D/g, '').slice(-10)
        : null;
      if (cleanCaller && cleanCaller.length >= 7) {
        query.mobileNumber = { $not: new RegExp(`${cleanCaller}$`) };
      }

      if (queueType) {
        const normalized = queueType.toUpperCase().trim();
        if (
          normalized === '1' ||
          normalized === 'LOCAL' ||
          normalized === 'LOCAL_RIDES'
        ) {
          query.$and = [
            {
              $or: [
                {
                  queueType: {
                    $in: ['LOCAL', 'Local_Rides', 'BOTH', 'All_Rides', 'ALL'],
                  },
                },
                {
                  assignQueue: {
                    $in: ['LOCAL', 'Local_Rides', 'BOTH', 'All_Rides', 'ALL'],
                  },
                },
                { queueType: { $exists: false } },
                { queueType: null },
                { queueType: '' },
              ],
            },
          ];
        } else if (
          normalized === '2' ||
          normalized === 'LONG_DISTANCE' ||
          normalized === 'LONG_DISTANCE_RIDE'
        ) {
          query.$and = [
            {
              $or: [
                {
                  queueType: {
                    $in: [
                      'LONG_DISTANCE',
                      'Long_Distance_Ride',
                      'BOTH',
                      'All_Rides',
                      'ALL',
                    ],
                  },
                },
                {
                  assignQueue: {
                    $in: [
                      'LONG_DISTANCE',
                      'Long_Distance_Ride',
                      'BOTH',
                      'All_Rides',
                      'ALL',
                    ],
                  },
                },
              ],
            },
          ];
        } else if (
          normalized === '3' ||
          normalized === 'BOTH' ||
          normalized === 'ALL' ||
          normalized === 'ALL_RIDES'
        ) {
          // Press 3 = BOTH: all available logged-in drivers are returned across all batches
        } else {
          query.$and = [
            {
              $or: [
                { queueType: { $in: [queueType, 'BOTH', 'All_Rides', 'ALL'] } },
                {
                  assignQueue: { $in: [queueType, 'BOTH', 'All_Rides', 'ALL'] },
                },
              ],
            },
          ];
        }
      }

      let eligibleDrivers = await this.driverModel.find(query);

      // Exclude caller/customer phone so a driver is never dispatched to their own ride
      if (cleanCaller && cleanCaller.length >= 7) {
        eligibleDrivers = eligibleDrivers.filter((d) => {
          const cleanDriverPhone = (d.mobileNumber || '')
            .replace(/\D/g, '')
            .slice(-10);
          return !cleanDriverPhone || cleanDriverPhone !== cleanCaller;
        });
      }

      const mapDriver = (d: DriverDocument) => ({
        driverId: d.driverId,
        mobileNumber: d.mobileNumber,
        countryCode: this.normalizeCountryCode(d.countryCode),
      });

      // Drivers without an explicit batch (or batch !== 2, 3) default to Batch 1 so no driver is lost
      const batch1Drivers = eligibleDrivers
        .filter(
          (d) => !d.batch || d.batch === 1 || (d.batch !== 2 && d.batch !== 3),
        )
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
        Msg.IVR_ONLINE_BATCHES_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getDriverStatus(mobileNumber: string) {
    try {
      const driver = await this.findDriverByPhoneNumber(mobileNumber);

      if (!driver) {
        return new ApiResponse(
          404,
          { registered: false },
          Msg.DRIVER_NOT_FOUND,
        );
      }

      if (this.isDriverBlocked(driver)) {
        return new ApiResponse(
          200,
          {
            registered: true,
            driverId: driver.driverId || driver._id,
            driverName: driver.driverName,
            status: driver.status || 'Block',
            lockedOut: true,
            isLockedOut: true,
            loggedIn: false,
            available: false,
            workflowStage: 'LOCKED_OUT',
            activeTrip: false,
            trip: null,
            activeTripData: null,
          },
          Msg.IVR_DRIVER_ACCOUNT_INACTIVE,
        );
      }

      let workflowStage = 'IDLE';
      let activeTripData: any = null;
      let completedTripData: any = null;

      const hasValidActiveRideId =
        driver.activeRideId &&
        driver.activeRideId !== 'null' &&
        isValidObjectId(driver.activeRideId);

      let ride = hasValidActiveRideId
        ? await this.rideModel.findById(driver.activeRideId)
        : null;

      // If linked ride is already completed, paid, or cancelled, finalize and reset active ride
      const isRidePaidOrCompleted =
        ride &&
        (ride.paymentStatus === PaymentStatus.COMPLETED ||
          ride.paymentStatus === 'COMPLETED' ||
          ride.rideStatus === RideStatus.COMPLETED ||
          ride.rideStatus === 'COMPLETED' ||
          ride.rideStatus === RideStatus.CANCELLED ||
          ride.rideStatus === 'CANCELLED' ||
          ![
            RideStatus.ACCEPTED,
            RideStatus.STARTED,
            RideStatus.PAYMENT_PENDING,
            'ACCEPTED',
            'STARTED',
            'PAYMENT_PENDING',
          ].includes(ride.rideStatus as any));

      if (isRidePaidOrCompleted && ride) {
        if (
          ride.rideStatus === RideStatus.COMPLETED ||
          ride.rideStatus === 'COMPLETED' ||
          ride.paymentStatus === PaymentStatus.COMPLETED ||
          ride.paymentStatus === 'COMPLETED'
        ) {
          if (
            ride.rideStatus !== RideStatus.COMPLETED &&
            ride.rideStatus !== 'COMPLETED'
          ) {
            ride.rideStatus = RideStatus.COMPLETED;
            ride.rideCompleteDateTime =
              ride.rideCompleteDateTime || new Date().toISOString();
            await ride.save();
          }

          completedTripData = {
            tripId: ride._id,
            tripNumber: ride.tripNumber,
            customerName: ride.customerName || '',
            customerNumber: ride.customerNumber || '',
            queueName: ride.queueName || '',
            recordingUrl: ride.recordingUrl || '',
            rideStatus: ride.rideStatus || 'COMPLETED',
            status: ride.rideStatus || 'COMPLETED',
            paymentStatus: ride.paymentStatus || 'COMPLETED',
            paymentType: ride.paymentType || '',
            transactionId: ride.paymentTransactionId || '',
            authCode: ride.paymentAuthCode || '',
            rideAmount: ride.rideAmount || 0,
            fareAmount: ride.rideAmount || 0,
            rideStartDateTime: ride.rideStartDateTime || '',
            rideCompleteDateTime: ride.rideCompleteDateTime || '',
          };
        }
        ride = null;
        if (driver.activeRideId) {
          driver.activeRideId = '';
          driver.isAvailable = true;
          driver.ongoingRides = 'NO';
          await driver.save();
        }
      } else if (ride) {
        if (!driver.isLoggedIn) {
          driver.isLoggedIn = true;
          driver.loginLogout = 'START';
        }
        driver.isAvailable = false;
        driver.ongoingRides = 'YES';
        await driver.save();
      } else if (driver.activeRideId && !hasValidActiveRideId) {
        driver.activeRideId = '';
        await driver.save();
      }

      // Fallback: If activeRideId was not linked on driver, search by driverId or mobile number
      if (!ride) {
        const driverFilter = {
          $or: [
            { driverId: driver._id.toString() },
            { driverId: String(driver.driverId) },
            { driverNumber: driver.mobileNumber },
          ],
          paymentStatus: { $ne: 'COMPLETED' },
        };

        // Prioritize PAYMENT_PENDING and STARTED over newly assigned ACCEPTED
        ride = await this.rideModel
          .findOne({
            ...driverFilter,
            rideStatus: {
              $in: [
                RideStatus.PAYMENT_PENDING,
                RideStatus.STARTED,
                'PAYMENT_PENDING',
                'STARTED',
              ],
            },
          })
          .sort({ createdAt: -1 });

        if (!ride) {
          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
          ride = await this.rideModel
            .findOne({
              ...driverFilter,
              rideStatus: {
                $in: [RideStatus.ACCEPTED, 'ACCEPTED'],
              },
              createdAt: { $gte: fourHoursAgo },
            })
            .sort({ createdAt: -1 });
        }

        // Auto-sync driver record if active ride is found
        if (ride) {
          const isRideFinishedOrCancelled =
            ride.rideStatus === RideStatus.COMPLETED ||
            ride.rideStatus === 'COMPLETED' ||
            ride.paymentStatus === 'COMPLETED' ||
            ride.rideStatus === RideStatus.CANCELLED ||
            ride.rideStatus === 'CANCELLED';

          if (isRideFinishedOrCancelled) {
            driver.activeRideId = '';
            driver.isAvailable = true;
            driver.ongoingRides = 'NO';
          } else {
            driver.activeRideId = ride._id.toString();
            driver.isAvailable = false;
            driver.ongoingRides = 'YES';
            if (!driver.isLoggedIn) {
              driver.isLoggedIn = true;
              driver.loginLogout = 'START';
            }
          }
          await driver.save();
        }
      }

      // If no active ride found, check if a ride was recently completed or paid
      if (!ride && !completedTripData) {
        const recentCompletedRide = await this.rideModel
          .findOne({
            $or: [
              { driverId: driver._id.toString() },
              { driverId: String(driver.driverId) },
              { driverNumber: driver.mobileNumber },
            ],
            $and: [
              {
                $or: [
                  { rideStatus: { $in: [RideStatus.COMPLETED, 'COMPLETED'] } },
                  {
                    paymentStatus: {
                      $in: [PaymentStatus.COMPLETED, 'COMPLETED'],
                    },
                  },
                ],
              },
            ],
          })
          .sort({ updatedAt: -1 });

        if (recentCompletedRide) {
          completedTripData = {
            tripId: recentCompletedRide._id,
            tripNumber: recentCompletedRide.tripNumber,
            customerName: recentCompletedRide.customerName || '',
            customerNumber: recentCompletedRide.customerNumber || '',
            queueName: recentCompletedRide.queueName || '',
            recordingUrl: recentCompletedRide.recordingUrl || '',
            rideStatus: recentCompletedRide.rideStatus || 'COMPLETED',
            status: recentCompletedRide.rideStatus || 'COMPLETED',
            paymentStatus: recentCompletedRide.paymentStatus || 'COMPLETED',
            paymentType: recentCompletedRide.paymentType || '',
            transactionId: recentCompletedRide.paymentTransactionId || '',
            authCode: recentCompletedRide.paymentAuthCode || '',
            rideAmount: recentCompletedRide.rideAmount || 0,
            fareAmount: recentCompletedRide.rideAmount || 0,
            rideStartDateTime: recentCompletedRide.rideStartDateTime || '',
            rideCompleteDateTime:
              recentCompletedRide.rideCompleteDateTime || '',
          };
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
            workflowStage,
            action: 'PLAY_START_OR_CANCEL_MENU',
            menu: 'START_OR_CANCEL',
            fareOverrideApplied: false,
          };
        } else if (ride.rideStatus === RideStatus.STARTED) {
          workflowStage = 'IN_PROGRESS';
          activeTripData = {
            ...baseTripData,
            workflowStage,
            action: 'PLAY_COMPLETE_MENU',
            menu: 'IN_PROGRESS',
            fareOverrideApplied: false,
          };
        } else if (ride.rideStatus === RideStatus.PAYMENT_PENDING) {
          workflowStage = ride.selectedZone
            ? 'AWAITING_PAYMENT'
            : 'ZONE_SELECTION';

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
          let calculatedFare =
            ride.originalCalculatedFare || ride.rideAmount || 0;

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
              console.log(
                'Failed calculating zone fare for status',
                err.message,
              );
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
            workflowStage,
            menu: ride.selectedZone ? 'PAYMENT_OPTIONS' : 'ZONE_SELECTION',
            action: ride.selectedZone ? 'PLAY_PAYMENT_MENU' : 'PLAY_ZONE_MENU',
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
      const isPendingPayment = ride?.rideStatus === RideStatus.PAYMENT_PENDING;

      let topLevelMessage = Msg.IVR_DRIVER_STATUS_FETCHED;
      let topLevelAction = activeTripData?.action;
      let topLevelMenu = activeTripData?.menu;

      if (!hasActiveTrip) {
        workflowStage = driver.isLoggedIn ? 'LOGGED_IN' : 'IDLE';
        topLevelAction = 'PLAY_LOGIN_MENU';
        topLevelMenu = 'LOGIN_LOGOUT';
        topLevelMessage = Msg.IVR_PLAY_LOGIN_MENU;
      } else if (isPendingPayment) {
        topLevelMessage = !ride?.selectedZone
          ? Msg.IVR_PLAY_ZONE_SELECTION_MENU
          : Msg.IVR_PLAY_PAYMENT_OPTIONS_MENU;
      }

      return new ApiResponse(
        200,
        {
          registered: true,
          driverId: driver.driverId || driver._id,
          driverName: driver.driverName,
          phoneNumber: driver.mobileNumber,
          status: driver.status || 'ACTIVE',
          lockedOut: false,
          isLockedOut: false,
          loggedIn: hasActiveTrip ? true : driver.isLoggedIn,
          serviceType: driver.queueType,
          available: hasActiveTrip ? false : driver.isAvailable,
          workflowStage,
          action: topLevelAction,
          menu: topLevelMenu,
          activeTrip: hasActiveTrip,
          trip: hasActiveTrip ? activeTripData : completedTripData || null,
          activeTripData: activeTripData || null,
        },
        topLevelMessage,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  private async findCustomerByPhoneNumber(
    rawPhone: string,
  ): Promise<CustomerDocument | null> {
    if (!rawPhone) return null;
    const phoneConditions = buildPhoneMatchConditions(rawPhone, 'mobileNumber');
    return this.customerModel
      .findOne({ $or: phoneConditions })
      .sort({ createdAt: -1, _id: -1 });
  }

  async getCustomerStatus(mobileNumber: string) {
    try {
      if (!mobileNumber) {
        return new ApiResponse(400, {}, Msg.IVR_MOBILE_NUMBER_REQUIRED);
      }

      const customer = await this.findCustomerByPhoneNumber(mobileNumber);

      const cleanDigits = mobileNumber.replace(/\D/g, '');
      const last10 =
        cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

      const customerPhoneQueries: any[] = [{ customerNumber: mobileNumber }];
      if (cleanDigits) {
        customerPhoneQueries.push({ customerNumber: cleanDigits });
        customerPhoneQueries.push({
          customerNumber: { $regex: cleanDigits, $options: 'i' },
        });
      }
      if (last10 && last10 !== cleanDigits) {
        customerPhoneQueries.push({ customerNumber: last10 });
        customerPhoneQueries.push({
          customerNumber: { $regex: last10, $options: 'i' },
        });
      }

      // 1. Look for active/ongoing ride WITH A VALID ASSIGNED DRIVER (last 4 hours)
      // Excludes PENDING rides (unassigned) and rides without a valid driver
      const activeRide = await this.rideModel
        .findOne({
          $or: customerPhoneQueries,
          rideStatus: {
            $in: [
              RideStatus.ACCEPTED,
              RideStatus.DRIVER_FOUND,
              RideStatus.DRIVER_ARRIVED,
              RideStatus.STARTED,
              RideStatus.ONGOING,
              RideStatus.PAYMENT_PENDING,
              'ACCEPTED',
              'DRIVER_FOUND',
              'DRIVER_ARRIVED',
              'STARTED',
              'ONGOING',
              'PAYMENT_PENDING',
            ],
          },
          $and: [
            {
              $or: [
                { driverNumber: { $exists: true, $ne: '' } },
                { driverId: { $exists: true, $ne: '' } },
              ],
            },
          ],
          paymentStatus: { $ne: 'COMPLETED' },
          createdAt: { $gte: new Date(Date.now() - 4 * 60 * 60 * 1000) },
        })
        .sort({ createdAt: -1 });

      let driverDetails: any = null;
      let tripData: any = null;

      if (activeRide) {
        let driver: DriverDocument | null = null;
        if (activeRide.driverId) {
          driver = await this.driverModel
            .findById(activeRide.driverId)
            .catch(() => null);
          if (!driver) {
            const numId = Number(activeRide.driverId);
            if (!isNaN(numId)) {
              driver = await this.driverModel.findOne({ driverId: numId });
            }
          }
        }
        if (!driver && activeRide.driverNumber) {
          driver = await this.findDriverByPhoneNumber(
            activeRide.driverNumber,
          );
        }

        if (driver) {
          driverDetails = {
            driverId: driver.driverId || driver._id,
            driverName: driver.driverName || activeRide.driverName || '',
            mobileNumber:
              driver.mobileNumber || activeRide.driverNumber || '',
            vehicleNumber: driver.vehicleNumber || '',
            makeModel: driver.makeModel || '',
            color: driver.color || '',
            licenceNumber: driver.licenceNumber || '',
            batch: driver.batch || 1,
            countryCode: this.normalizeCountryCode(driver.countryCode),
          };
        } else if (activeRide.driverName || activeRide.driverNumber) {
          driverDetails = {
            driverId: activeRide.driverId || '',
            driverName: activeRide.driverName || '',
            mobileNumber: activeRide.driverNumber || '',
            vehicleNumber: '',
            makeModel: '',
            color: '',
            licenceNumber: '',
            batch: 1,
            countryCode: '',
          };
        }

        tripData = {
          tripId: activeRide._id,
          tripNumber: activeRide.tripNumber,
          customerName:
            activeRide.customerName || (customer ? customer.fullName : ''),
          customerNumber: activeRide.customerNumber || mobileNumber,
          queueName: activeRide.queueName || '',
          recordingUrl: activeRide.recordingUrl || '',
          rideStatus: activeRide.rideStatus,
          status: activeRide.rideStatus,
          paymentStatus: activeRide.paymentStatus || 'PENDING',
          paymentType: activeRide.paymentType || null,
          rideAmount: activeRide.rideAmount || 0,
          fareAmount: activeRide.rideAmount || 0,
          selectedZone: activeRide.selectedZone || '',
          driverAwayMinutes: activeRide.driverAwayMinutes || '',
          rideStartDateTime: activeRide.rideStartDateTime || '',
          rideCompleteDateTime: activeRide.rideCompleteDateTime || '',
          driver: driverDetails,
        };
      }

      const hasActiveTrip = !!activeRide && !!driverDetails;

      return new ApiResponse(
        200,
        {
          registered: !!customer,
          customer: customer
            ? {
                customerId: customer.customerId || customer._id,
                fullName: customer.fullName,
                mobileNumber: customer.mobileNumber,
                email: customer.email || '',
                address: customer.address || customer.fullAddress || '',
                cardLast4: customer.cardLast4 || '',
                cardBrand: customer.cardBrand || '',
                hasSavedCard: !!customer.cardLast4,
                credit: customer.credit || 0,
              }
            : null,
          activeTrip: hasActiveTrip,
          trip: hasActiveTrip ? tripData : null,
          driver: hasActiveTrip ? driverDetails : null,
        },
        Msg.IVR_CUSTOMER_STATUS_FETCHED,
      );
    } catch (error) {
      console.log('Error in getCustomerStatus:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  private async cancelOtherCalls(tripNumber: string) {
    const pythonUrl = process.env.PYTHON_IVR_URL || 'http://localhost:5000';
    try {
      await axios.post(
        `${pythonUrl}/api/cancel-calls`,
        { tripNumber },
        { timeout: 3000 },
      );
    } catch (err) {
      // Python IVR handles closing competing offers internally upon SAY_ACCEPTED.
      // Timeout prevents event-loop hanging when endpoint is not configured.
    }
  }
}

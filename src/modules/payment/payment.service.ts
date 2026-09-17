import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import * as crypto from 'crypto';
import { PaymentLog, PaymentLogDocument } from './schema/payment-log.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { Customer, CustomerDocument } from '../customer/schema/customer.schema';
import { Driver, DriverDocument } from '../driver/schema/driver.schema';
import { ProcessCardPaymentDto } from './dto/process-card-payment.dto';
import { ChargeRidePaymentDto } from './dto/charge-ride-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { SaveCardDto } from './dto/save-card.dto';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { PaymentStatus } from 'src/common/enums/payment/payment-status';
import { PaymentType } from 'src/common/enums/payment/payment-type';
import { RideStatus } from 'src/common/enums/ride/ride-enum';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(PaymentLog.name)
    private paymentLogModel: Model<PaymentLogDocument>,
    @InjectModel(Ride.name)
    private rideModel: Model<RideDocument>,
    @InjectModel(Customer.name)
    private customerModel: Model<CustomerDocument>,
    @InjectModel(Driver.name)
    private driverModel: Model<DriverDocument>,
  ) {}

  private normalizeExpiration(exp?: string): string {
    if (!exp) return '';
    const clean = exp.replace(/\D/g, '');
    if (clean.length === 4) return clean; // MMYY
    if (clean.length === 6) {
      // MMYYYY -> MMYY
      return clean.slice(0, 2) + clean.slice(4, 6);
    }
    return clean;
  }

  private async findLinkedDriver(
    ride: RideDocument,
  ): Promise<DriverDocument | null> {
    if (ride._id) {
      const driverByActive = await this.driverModel.findOne({
        activeRideId: ride._id.toString(),
      });
      if (driverByActive) return driverByActive;
    }

    if (ride.driverId) {
      const byId = await this.driverModel
        .findById(ride.driverId)
        .catch(() => null);
      if (byId) return byId;

      const numId = Number(ride.driverId);
      if (!isNaN(numId) && numId > 0) {
        const byNumId = await this.driverModel.findOne({ driverId: numId });
        if (byNumId) return byNumId;
      }
    }

    if (ride.driverNumber) {
      const cleanDriverNumber = (ride.driverNumber || '').replace(/\D/g, '');
      const driverByPhone = await this.driverModel.findOne({
        $or: [
          { mobileNumber: ride.driverNumber },
          ...(cleanDriverNumber && cleanDriverNumber.length >= 7
            ? [{ mobileNumber: { $regex: cleanDriverNumber, $options: 'i' } }]
            : []),
        ],
      });
      if (driverByPhone) return driverByPhone;
    }

    return null;
  }

  private async executeUSAePayRequest(endpoint: string, payload: any) {
    const apiKey = (process.env.USAEPAY_API_KEY || '').trim();
    const apiPin = (process.env.USAEPAY_API_PIN || '').trim();
    const baseUrl = (
      process.env.USAEPAY_BASE_URL || 'https://sandbox.usaepay.com/api/v2'
    ).replace(/\/$/, '');

    const targetUrls = [`${baseUrl}/${endpoint.replace(/^\//, '')}`];
    if (baseUrl.includes('sandbox')) {
      targetUrls.push(
        `https://sandbox.usaepay.com/api/v2/${endpoint.replace(/^\//, '')}`,
      );
    } else {
      targetUrls.push(
        `https://usaepay.com/api/v2/${endpoint.replace(/^\//, '')}`,
      );
    }

    // Remove duplicate URLs
    const urls = Array.from(new Set(targetUrls));

    // Auth strategies
    const authHeaders: { name: string; header: string }[] = [];

    // 1. Official USAePay s2 SHA256 API Hash (Standard when PIN is present)
    if (apiKey && apiPin) {
      try {
        const seed = crypto.randomBytes(8).toString('hex'); // 16 alphanumeric characters
        const prehash = apiKey + seed + apiPin;
        const apihash =
          's2/' +
          seed +
          '/' +
          crypto.createHash('sha256').update(prehash).digest('hex');
        const authKey = Buffer.from(`${apiKey}:${apihash}`).toString('base64');
        authHeaders.push({
          name: 'Official USAePay s2 SHA256 Hash',
          header: `Basic ${authKey}`,
        });
      } catch (e) {}
    }

    // 2. Direct Basic Auth with PIN
    if (apiKey && apiPin) {
      authHeaders.push({
        name: 'Basic with PIN',
        header: `Basic ${Buffer.from(`${apiKey}:${apiPin}`).toString('base64')}`,
      });
    }

    // 3. Direct Basic Auth without PIN
    if (apiKey) {
      authHeaders.push({
        name: 'Basic without PIN',
        header: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      });
    }

    if (!apiKey || authHeaders.length === 0) {
      throw new Error(
        'USAePay configuration missing: USAEPAY_API_KEY is not defined in environment variables.',
      );
    }

    let lastError: any = null;

    for (const url of urls) {
      for (const authObj of authHeaders) {
        try {
          this.logger.log(
            `Attempting USAePay request [${authObj.name}] at ${url}`,
          );
          const response = await axios.post(url, payload, {
            headers: {
              Authorization: authObj.header,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          });

          this.logger.log(`USAePay Success using [${authObj.name}] at ${url}`);
          return response;
        } catch (err: any) {
          lastError = err;
          const status = err.response?.status || 'ERR';
          const errData = JSON.stringify(
            err.response?.data || err.message || '',
          );
          this.logger.warn(
            `USAePay [${authObj.name}] at ${url} failed (HTTP ${status}): ${errData}`,
          );
        }
      }
    }

    throw (
      lastError ||
      new Error('USAePay request failed: No response from gateway.')
    );
  }

  private getBaseUrl(): string {
    return (
      process.env.USAEPAY_BASE_URL || 'https://sandbox.usaepay.com/api/v2'
    ).replace(/\/$/, '');
  }

  async processCardSale(dto: ProcessCardPaymentDto) {
    try {
      const apiKey = (process.env.USAEPAY_API_KEY || '').trim();
      const amountStr = Number(dto.amount).toFixed(2);
      const cleanCard = (dto.cardNumber || '').replace(/[\s-]/g, '');
      const cleanExp = this.normalizeExpiration(dto.expiration);

      const payload: any = {
        command: 'cc:sale',
        amount: amountStr,
        invoice: dto.tripNumber || `INV-${Date.now()}`,
        description: `Carline Ride Payment - ${dto.tripNumber || 'Direct Card'}`,
        creditcard: {
          number: cleanCard,
          expiration: cleanExp,
          cvv: dto.cvv,
          cvc: dto.cvv,
          cardholder: dto.cardholder || 'Valued Customer',
        },
      };

      if (apiKey) {
        payload.key = apiKey;
      }

      this.logger.log(`Initiating USAePay sale for amount: $${amountStr}`);

      const response = await this.executeUSAePayRequest(
        'transactions',
        payload,
      );

      console.log('----------->', response.data);

      const resData = response.data;
      const isApproved =
        resData &&
        (resData.status === 'Approved' ||
          resData.result_code === 'A' ||
          resData.result === 'Approved');

      const last4 = dto.cardNumber ? dto.cardNumber.slice(-4) : '****';
      const cardMasked = `**** **** **** ${last4}`;

      const log = new this.paymentLogModel({
        rideId: dto.rideId || '',
        tripNumber: dto.tripNumber || '',
        amount: dto.amount,
        currency: 'USD',
        paymentType: PaymentType.CREDIT_CARD,
        status: isApproved ? PaymentStatus.APPROVED : PaymentStatus.DECLINED,
        transactionId: resData.refnum || resData.key || '',
        authCode: resData.authcode || resData.auth_code || '',
        cardMasked,
        gatewayResponse: resData,
        errorMessage: isApproved
          ? ''
          : resData.error || resData.status || 'Transaction Declined',
      });
      await log.save();

      if (dto.tripNumber || dto.rideId) {
        const query = dto.tripNumber
          ? { tripNumber: dto.tripNumber }
          : { _id: dto.rideId };

        await this.rideModel.updateOne(query, {
          $set: {
            paymentType: PaymentType.CREDIT_CARD,
            paymentStatus: isApproved
              ? PaymentStatus.COMPLETED
              : PaymentStatus.FAILED,
            paymentTransactionId: resData.refnum || resData.key || '',
            paymentAuthCode: resData.authcode || '',
            paymentGatewayResponse: resData,
            ridePaymentDateTime: new Date().toISOString(),
          },
        });
      }

      if (!isApproved) {
        return new ApiResponse(
          400,
          { gatewayResponse: resData },
          Msg.PAYMENT_DECLINED,
        );
      }

      return new ApiResponse(
        200,
        {
          transactionId: resData.refnum || resData.key,
          authCode: resData.authcode,
          status: PaymentStatus.APPROVED,
          amount: dto.amount,
          cardMasked,
        },
        Msg.PAYMENT_PROCESSED,
      );
    } catch (error: any) {
      const errorMsg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        Msg.PAYMENT_FAILED;

      this.logger.error(`USAePay Transaction Error: ${errorMsg}`);

      const log = new this.paymentLogModel({
        rideId: dto.rideId || '',
        tripNumber: dto.tripNumber || '',
        amount: dto.amount,
        currency: 'USD',
        paymentType: PaymentType.CREDIT_CARD,
        status: PaymentStatus.FAILED,
        errorMessage: errorMsg,
        gatewayResponse: error.response?.data || {},
      });
      await log.save();

      return new ApiResponse(500, { error: errorMsg }, Msg.PAYMENT_FAILED);
    }
  }

  async chargeRideVault(dto: ChargeRidePaymentDto) {
    try {
      const ride = await this.rideModel.findOne({ tripNumber: dto.tripNumber });
      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      // Idempotency check: If ride has already been successfully paid, do not charge again
      if (
        ride.paymentStatus === PaymentStatus.COMPLETED ||
        ride.paymentStatus === 'COMPLETED' ||
        ride.rideStatus === RideStatus.COMPLETED ||
        ride.rideStatus === 'COMPLETED'
      ) {
        // Ensure rideStatus is marked COMPLETED if it wasn't already
        if (
          ride.rideStatus !== RideStatus.COMPLETED &&
          ride.rideStatus !== 'COMPLETED'
        ) {
          ride.rideStatus = RideStatus.COMPLETED;
          ride.rideCompleteDateTime =
            ride.rideCompleteDateTime || new Date().toISOString();
          await ride.save();
        }

        // Ensure driver is freed up if still linked
        const driver = await this.findLinkedDriver(ride);
        if (driver && driver.activeRideId === ride._id.toString()) {
          driver.activeRideId = '';
          driver.isAvailable = true;
          driver.ongoingRides = 'NO';
          await driver.save();
        }

        return new ApiResponse(
          200,
          {
            tripNumber: ride.tripNumber,
            transactionId: ride.paymentTransactionId || '',
            authCode: ride.paymentAuthCode || '',
            refnum: ride.paymentTransactionId || '',
            amount: ride.rideAmount || dto.amount,
            status: 'Approved',
            alreadyPaid: true,
          },
          Msg.VAULT_CHARGED,
        );
      }

      const amountToCharge = dto.amount || ride.rideAmount;
      if (!amountToCharge || amountToCharge <= 0) {
        return new ApiResponse(400, {}, Msg.BAD_REQUEST);
      }

      const apiKey = (process.env.USAEPAY_API_KEY || '').trim();
      const amountStr = Number(amountToCharge).toFixed(2);

      const payload: any = {
        command: 'cc:sale',
        amount: amountStr,
        invoice: dto.tripNumber,
        description: `Ride Charge for ${dto.tripNumber}`,
      };

      if (apiKey) {
        payload.key = apiKey;
      }

      let targetTokenOrId = dto.customerId;
      if (!targetTokenOrId && ride.customerNumber) {
        const cleanNumber = (ride.customerNumber || '').trim();
        const variations = [
          cleanNumber,
          cleanNumber.replace(/^\+/, ''),
          cleanNumber.startsWith('+91') ? cleanNumber.slice(3) : cleanNumber,
          cleanNumber.startsWith('+1') ? cleanNumber.slice(2) : cleanNumber,
        ];
        const customer =
          (await this.customerModel.findOne({
            mobileNumber: { $in: variations },
            usaepayCustomerId: { $exists: true, $ne: '' },
          })) ||
          (await this.customerModel.findOne({
            mobileNumber: { $in: variations },
          }));
        if (customer && customer.usaepayCustomerId) {
          targetTokenOrId = customer.usaepayCustomerId;
        }
      }

      if (!targetTokenOrId) {
        try {
          const log = new this.paymentLogModel({
            rideId: ride._id.toString(),
            tripNumber: dto.tripNumber,
            customerNumber: ride.customerNumber,
            amount: amountToCharge,
            currency: 'USD',
            paymentType: PaymentType.SAVED_CARD,
            status: PaymentStatus.FAILED,
            errorMessage: Msg.NO_SAVED_CARD,
          });
          await log.save();
        } catch (logErr) {
          this.logger.error(`Failed to save payment log: ${logErr?.message}`);
        }

        return new ApiResponse(400, {}, Msg.NO_SAVED_CARD);
      }

      if (targetTokenOrId.includes('-') || targetTokenOrId.length > 15) {
        payload.creditcard = { number: targetTokenOrId };
      } else {
        payload.customer_id = targetTokenOrId;
      }

      const response = await this.executeUSAePayRequest(
        'transactions',
        payload,
      );

      const resData = response.data;
      const isApproved =
        resData &&
        (resData.status === 'Approved' ||
          resData.result_code === 'A' ||
          resData.result === 'Approved');

      const transactionId =
        resData?.refnum || resData?.key || resData?.id || '';
      const authCode = resData?.authcode || '';

      ride.paymentType = PaymentType.SAVED_CARD;
      ride.paymentStatus = isApproved
        ? PaymentStatus.COMPLETED
        : PaymentStatus.FAILED;
      ride.paymentTransactionId = transactionId;
      ride.paymentAuthCode = authCode;
      ride.paymentGatewayResponse = resData;
      ride.ridePaymentDateTime = new Date().toISOString();

      if (isApproved) {
        ride.rideStatus = RideStatus.COMPLETED;
        ride.rideCompleteDateTime =
          ride.rideCompleteDateTime || new Date().toISOString();
        if (amountToCharge) {
          ride.rideAmount = amountToCharge;
        }
      }
      await ride.save();

      const log = new this.paymentLogModel({
        rideId: ride._id.toString(),
        tripNumber: dto.tripNumber,
        customerNumber: ride.customerNumber,
        amount: amountToCharge,
        currency: 'USD',
        paymentType: PaymentType.SAVED_CARD,
        status: isApproved ? PaymentStatus.APPROVED : PaymentStatus.DECLINED,
        transactionId: transactionId,
        authCode: authCode,
        gatewayResponse: resData,
        errorMessage: isApproved
          ? ''
          : resData.error || 'Account Charge Declined',
      });
      await log.save();

      if (isApproved) {
        // Find and free up the driver, update earnings
        const driver = await this.findLinkedDriver(ride);
        if (driver) {
          driver.activeRideId = '';
          driver.isAvailable = true;
          driver.ongoingRides = 'NO';
          driver.lastTripTaken = new Date();
          driver.earningsWithoutCash =
            (driver.earningsWithoutCash || 0) + (amountToCharge || 0);
          driver.totalEarnings =
            (driver.earningsWithCash || 0) + (driver.earningsWithoutCash || 0);
          await driver.save();
        }
      }

      if (!isApproved) {
        return new ApiResponse(400, resData, Msg.PAYMENT_DECLINED);
      }

      return new ApiResponse(
        200,
        {
          tripNumber: dto.tripNumber,
          transactionId: transactionId,
          authCode: authCode,
          refnum: transactionId,
          amount: amountToCharge,
          status: 'Approved',
        },
        Msg.VAULT_CHARGED,
      );
    } catch (error: any) {
      const errorMsg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        Msg.PAYMENT_FAILED;

      this.logger.error(`USAePay Vault Charge Error: ${errorMsg}`);

      try {
        const ride = await this.rideModel
          .findOne({ tripNumber: dto.tripNumber })
          .catch(() => null);

        const log = new this.paymentLogModel({
          rideId: ride?._id ? ride._id.toString() : '',
          tripNumber: dto.tripNumber || '',
          customerNumber: ride?.customerNumber || '',
          amount: dto.amount || ride?.rideAmount || 0,
          currency: 'USD',
          paymentType: PaymentType.SAVED_CARD,
          status: PaymentStatus.FAILED,
          errorMessage: errorMsg,
          gatewayResponse: error?.response?.data || {},
        });
        await log.save();
      } catch (logErr: any) {
        this.logger.error(`Failed to save payment log: ${logErr?.message}`);
      }

      return new ApiResponse(500, { error: errorMsg }, Msg.PAYMENT_FAILED);
    }
  }

  async saveCustomerVaultCard(dto: SaveCardDto) {
    try {
      let customer = await this.customerModel.findOne({
        mobileNumber: dto.customerNumber,
      });

      if (!customer) {
        customer = new this.customerModel({
          mobileNumber: dto.customerNumber,
          fullName: dto.cardholder || 'IVR Customer',
        });
      }

      const apiKey = (process.env.USAEPAY_API_KEY || '').trim();
      const cleanCard = (dto.cardNumber || '').replace(/[\s-]/g, '');
      const cleanExp = this.normalizeExpiration(dto.expiration);

      const tokenPayload: any = {
        creditcard: {
          number: cleanCard,
          expiration: cleanExp,
          cvc: dto.cvv,
          cardholder: dto.cardholder || customer.fullName || 'Valued Customer',
        },
      };

      this.logger.log(
        `Tokenizing card for customer: ${dto.customerNumber} via /tokens`,
      );

      let response: any;
      try {
        response = await this.executeUSAePayRequest('tokens', tokenPayload);
      } catch (err) {
        const fallbackPayload: any = {
          command: 'cc:save',
          creditcard: {
            number: cleanCard,
            expiration: cleanExp,
            cvv: dto.cvv,
            cvc: dto.cvv,
            cardholder:
              dto.cardholder || customer.fullName || 'Valued Customer',
          },
        };
        response = await this.executeUSAePayRequest(
          'transactions',
          fallbackPayload,
        );
      }

      const resData = response.data;
      const customerId =
        resData.key ||
        resData.token ||
        resData.savedcard?.key ||
        resData.savedcard?.token ||
        resData.refnum ||
        resData.custnum ||
        resData.id;

      const last4 = cleanCard ? cleanCard.slice(-4) : '****';
      let cardType = resData.savedcard?.type;
      if (!cardType) {
        if (/^4/.test(cleanCard)) cardType = 'Visa';
        else if (/^5[1-5]/.test(cleanCard)) cardType = 'MasterCard';
        else if (/^3[47]/.test(cleanCard)) cardType = 'American Express';
        else if (/^6(?:011|5)/.test(cleanCard)) cardType = 'Discover';
        else cardType = 'Credit Card';
      }

      customer.usaepayCustomerId = customerId;
      customer.cardLast4 = last4;
      customer.cardBrand = cardType;
      await customer.save();

      return new ApiResponse(
        200,
        {
          customerNumber: dto.customerNumber,
          usaepayCustomerId: customerId,
          cardLast4: last4,
          cardBrand: cardType,
        },
        Msg.CARD_SAVED,
      );
    } catch (error: any) {
      const errorMsg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to save card to USAePay vault';

      return new ApiResponse(500, { error: errorMsg }, Msg.SERVER_ERROR);
    }
  }

  async refundTransaction(dto: RefundPaymentDto) {
    try {
      const apiKey = (process.env.USAEPAY_API_KEY || '').trim();
      const amountStr = Number(dto.amount).toFixed(2);
      const payload: any = {
        command: 'cc:refund',
        amount: amountStr,
        refnum: dto.transactionId,
        reason: dto.reason || 'Customer refund',
      };

      if (apiKey) {
        payload.key = apiKey;
      }

      let response: any;
      try {
        response = await this.executeUSAePayRequest(
          `transactions/${dto.transactionId}/refund`,
          payload,
        );
      } catch (err) {
        response = await this.executeUSAePayRequest('transactions', payload);
      }

      const resData = response.data;

      const log = new this.paymentLogModel({
        amount: dto.amount,
        currency: 'USD',
        paymentType: PaymentType.REFUND,
        status: PaymentStatus.REFUNDED,
        transactionId: dto.transactionId,
        gatewayResponse: resData,
      });
      await log.save();

      return new ApiResponse(200, resData, Msg.PAYMENT_REFUNDED);
    } catch (error: any) {
      const errorMsg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        Msg.PAYMENT_FAILED;

      this.logger.error(`USAePay Refund Error: ${errorMsg}`);

      try {
        const log = new this.paymentLogModel({
          amount: dto.amount,
          currency: 'USD',
          paymentType: PaymentType.REFUND,
          status: PaymentStatus.FAILED,
          transactionId: dto.transactionId || '',
          errorMessage: errorMsg,
          gatewayResponse: error?.response?.data || {},
        });
        await log.save();
      } catch (logErr: any) {
        this.logger.error(`Failed to save refund payment log: ${logErr?.message}`);
      }

      return new ApiResponse(500, { error: errorMsg }, Msg.PAYMENT_FAILED);
    }
  }

  async getLogs(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      const total = await this.paymentLogModel.countDocuments();
      const logs = await this.paymentLogModel
        .find()
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      if (!logs || logs.length === 0) {
        return new ApiResponse(404, {}, Msg.PAYMENT_LOGS_NOT_FOUND);
      }

      return new ApiResponse(
        200,
        { logs, total, page, limit },
        Msg.PAYMENT_LOGS_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getCustomerCardDetails(customerNumber: string) {
    try {
      const cleanNumber = (customerNumber || '').trim();
      const variations = [
        cleanNumber,
        cleanNumber.replace(/^\+/, ''),
        cleanNumber.startsWith('+91') ? cleanNumber.slice(3) : cleanNumber,
        cleanNumber.startsWith('+1') ? cleanNumber.slice(2) : cleanNumber,
      ];

      const customer =
        (await this.customerModel.findOne({
          mobileNumber: { $in: variations },
          usaepayCustomerId: { $exists: true, $ne: '' },
        })) ||
        (await this.customerModel.findOne({
          mobileNumber: { $in: variations },
        }));

      if (!customer || !customer.usaepayCustomerId) {
        return new ApiResponse(
          200,
          {
            hasCard: false,
            customerNumber: cleanNumber,
            maskedCardNumber: null,
            cardMasked: null,
            cardLast4: null,
            cardBrand: null,
          },
          Msg.NO_CARD_ON_FILE,
        );
      }

      const last4 = customer.cardLast4 || '****';
      const maskedCard = `**** **** **** ${last4}`;

      return new ApiResponse(
        200,
        {
          hasCard: true,
          customerNumber: customer.mobileNumber,
          cardMasked: maskedCard,
          cardLast4: last4,
          cardBrand: customer.cardBrand || 'Card',
        },
        Msg.CUSTOMER_CARD_DETAILS_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async logCashPayment(ride: RideDocument, amount: number) {
    try {
      const log = new this.paymentLogModel({
        rideId: ride._id ? ride._id.toString() : '',
        tripNumber: ride.tripNumber || '',
        customerNumber: ride.customerNumber || '',
        amount: amount || ride.rideAmount || 0,
        currency: 'USD',
        paymentType: PaymentType.CASH,
        status: PaymentStatus.COMPLETED,
        errorMessage: '',
      });
      await log.save();
    } catch (err: any) {
      this.logger.error(`Failed to save cash payment log: ${err?.message}`);
    }
  }
}


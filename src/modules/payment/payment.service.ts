import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { PaymentLog, PaymentLogDocument } from './schema/payment-log.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { Customer, CustomerDocument } from '../customer/schema/customer.schema';
import { ProcessCardPaymentDto } from './dto/process-card-payment.dto';
import { ChargeRidePaymentDto } from './dto/charge-ride-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { SaveCardDto } from './dto/save-card.dto';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { PaymentStatus } from 'src/common/enums/payment/payment-status';
import { PaymentType } from 'src/common/enums/payment/payment-type';

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
  ) {}

  private getAuthHeader(): { authHeader: string; apiKey: string } {
    const apiKey = (process.env.USAEPAY_API_KEY || '').trim();
    const apiPin = (process.env.USAEPAY_API_PIN || '').trim();

    if (!apiKey) {
      this.logger.error('USAePay API Key is missing in environment variables');
    }

    const crypto = require('crypto');
    const seed =
      Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const prehash = apiKey + seed + apiPin;
    const hash = crypto.createHash('sha256').update(prehash).digest('hex');

    const token = Buffer.from(`${apiKey}:${seed}:${hash}`).toString('base64');
    return {
      authHeader: `USASHA256 ${token}`,
      apiKey,
    };
  }

  private getBaseUrl(): string {
    return (
      process.env.USAEPAY_BASE_URL || 'https://sandbox.usaepay.com/api/v2'
    ).replace(/\/$/, '');
  }

  async processCardSale(dto: ProcessCardPaymentDto) {
    try {
      const url = `${this.getBaseUrl()}/transactions`;
      const { authHeader, apiKey } = this.getAuthHeader();

      const payload = {
        key: apiKey,
        command: 'sale',
        amount: dto.amount,
        invoice: dto.tripNumber || `INV-${Date.now()}`,
        description: `Carline Ride Payment - ${dto.tripNumber || 'Direct Card'}`,
        creditcard: {
          number: dto.cardNumber,
          expiration: dto.expiration,
          cvv: dto.cvv,
          cardholder: dto.cardholder || 'Valued Customer',
        },
      };

      this.logger.log(`Initiating USAePay sale for amount: $${dto.amount}`);

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });

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
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        Msg.PAYMENT_FAILED;

      this.logger.error(`USAePay Transaction Error: ${errorMsg}`);

      const log = new this.paymentLogModel({
        rideId: dto.rideId || '',
        tripNumber: dto.tripNumber || '',
        amount: dto.amount,
        currency: 'USD',
        paymentType: 'CREDIT_CARD',
        status: 'FAILED',
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

      const amountToCharge = dto.amount || ride.rideAmount;
      if (!amountToCharge || amountToCharge <= 0) {
        return new ApiResponse(400, {}, Msg.BAD_REQUEST);
      }

      const url = `${this.getBaseUrl()}/transactions`;
      const { authHeader, apiKey } = this.getAuthHeader();

      const payload: any = {
        key: apiKey,
        command: 'sale',
        amount: amountToCharge,
        invoice: dto.tripNumber,
        description: `Ride Charge for ${dto.tripNumber}`,
      };

      if (dto.customerId) {
        payload.customer_id = dto.customerId;
      } else if (ride.customerNumber) {
        const customer = await this.customerModel.findOne({
          mobileNumber: ride.customerNumber,
        });
        if (customer && customer.usaepayCustomerId) {
          payload.customer_id = customer.usaepayCustomerId;
        }
      }

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });

      const resData = response.data;
      const isApproved =
        resData &&
        (resData.status === 'Approved' ||
          resData.result_code === 'A' ||
          resData.result === 'Approved');

      ride.paymentType = PaymentType.CUSTOMER_ACCOUNT;
      ride.paymentStatus = isApproved
        ? PaymentStatus.COMPLETED
        : PaymentStatus.FAILED;
      ride.paymentTransactionId = resData.refnum || '';
      ride.paymentAuthCode = resData.authcode || '';
      ride.paymentGatewayResponse = resData;
      ride.ridePaymentDateTime = new Date().toISOString();
      await ride.save();

      const log = new this.paymentLogModel({
        rideId: ride._id.toString(),
        tripNumber: dto.tripNumber,
        customerNumber: ride.customerNumber,
        amount: amountToCharge,
        currency: 'USD',
        paymentType: PaymentType.CUSTOMER_ACCOUNT,
        status: isApproved ? PaymentStatus.APPROVED : PaymentStatus.DECLINED,
        transactionId: resData.refnum || '',
        authCode: resData.authcode || '',
        gatewayResponse: resData,
        errorMessage: isApproved
          ? ''
          : resData.error || 'Account Charge Declined',
      });
      await log.save();

      if (!isApproved) {
        return new ApiResponse(400, resData, Msg.PAYMENT_DECLINED);
      }

      return new ApiResponse(
        200,
        {
          tripNumber: dto.tripNumber,
          transactionId: resData.refnum,
          authCode: resData.authcode,
          amount: amountToCharge,
        },
        Msg.VAULT_CHARGED,
      );
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        Msg.PAYMENT_FAILED;

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

      const url = `${this.getBaseUrl()}/customers`;
      const { authHeader, apiKey } = this.getAuthHeader();

      const payload = {
        key: apiKey,
        name: dto.cardholder || customer.fullName || 'Valued Customer',
        phone: dto.customerNumber,
        payment_methods: [
          {
            card: {
              number: dto.cardNumber,
              expiration: dto.expiration,
              cvv: dto.cvv,
              cardholder:
                dto.cardholder || customer.fullName || 'Valued Customer',
            },
          },
        ],
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });

      const resData = response.data;
      const customerId =
        resData.custnum || resData.id || resData.key || `USAEPAY-${Date.now()}`;
      const last4 = dto.cardNumber ? dto.cardNumber.slice(-4) : '****';

      customer.usaepayCustomerId = customerId;
      customer.cardLast4 = last4;
      customer.cardBrand = 'Credit Card';
      await customer.save();

      return new ApiResponse(
        200,
        {
          customerNumber: dto.customerNumber,
          usaepayCustomerId: customerId,
          cardLast4: last4,
        },
        Msg.CARD_SAVED,
      );
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'Failed to save card to USAePay vault';

      return new ApiResponse(500, { error: errorMsg }, Msg.SERVER_ERROR);
    }
  }

  async refundTransaction(dto: RefundPaymentDto) {
    try {
      const url = `${this.getBaseUrl()}/transactions/${dto.transactionId}/refund`;
      const { authHeader } = this.getAuthHeader();

      const response = await axios.post(
        url,
        { amount: dto.amount, reason: dto.reason || 'Customer refund' },
        {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        },
      );

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
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        Msg.PAYMENT_FAILED;

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
        return new ApiResponse(404, {}, Msg.DATA_NOT_FOUND);
      }

      return new ApiResponse(
        200,
        { logs, total, page, limit },
        Msg.DATA_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

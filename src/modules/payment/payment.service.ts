import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { PaymentLog, PaymentLogDocument } from './schema/payment-log.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { ProcessCardPaymentDto } from './dto/process-card-payment.dto';
import { ChargeRidePaymentDto } from './dto/charge-ride-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(PaymentLog.name)
    private paymentLogModel: Model<PaymentLogDocument>,
    @InjectModel(Ride.name)
    private rideModel: Model<RideDocument>,
  ) {}

  private getAuthHeader(): string {
    const apiKey = (process.env.USAEPAY_API_KEY || '').trim();
    const apiPin = (process.env.USAEPAY_API_PIN || '').trim();

    if (!apiKey || !apiPin) {
      this.logger.error('USAePay API Key or PIN is missing in environment variables');
    }

    const credentials = Buffer.from(`${apiKey}:${apiPin}`).toString('base64');
    return `Basic ${credentials}`;
  }

  private getBaseUrl(): string {
    return (
      process.env.USAEPAY_BASE_URL || 'https://sandbox.usaepay.com/api/v2'
    ).replace(/\/$/, '');
  }

  async processCardSale(dto: ProcessCardPaymentDto) {
    try {
      const url = `${this.getBaseUrl()}/transactions`;
      const authHeader = this.getAuthHeader();

      const payload = {
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
        resData && (resData.status === 'Approved' || resData.result_code === 'A' || resData.result === 'Approved');

      const last4 = dto.cardNumber ? dto.cardNumber.slice(-4) : '****';
      const cardMasked = `**** **** **** ${last4}`;

      const log = new this.paymentLogModel({
        rideId: dto.rideId || '',
        tripNumber: dto.tripNumber || '',
        amount: dto.amount,
        currency: 'USD',
        paymentType: 'CREDIT_CARD',
        status: isApproved ? 'APPROVED' : 'DECLINED',
        transactionId: resData.refnum || resData.key || '',
        authCode: resData.authcode || resData.auth_code || '',
        cardMasked,
        gatewayResponse: resData,
        errorMessage: isApproved ? '' : resData.error || resData.status || 'Transaction Declined',
      });
      await log.save();

      if (dto.tripNumber || dto.rideId) {
        const query = dto.tripNumber
          ? { tripNumber: dto.tripNumber }
          : { _id: dto.rideId };
        
        await this.rideModel.updateOne(query, {
          $set: {
            paymentType: 'CREDIT_CARD',
            paymentStatus: isApproved ? 'COMPLETED' : 'FAILED',
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
          resData.error || 'Card payment declined by USAePay',
        );
      }

      return new ApiResponse(
        200,
        {
          transactionId: resData.refnum || resData.key,
          authCode: resData.authcode,
          status: 'APPROVED',
          amount: dto.amount,
          cardMasked,
        },
        'Card payment processed successfully',
      );
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'Failed to process transaction with USAePay';

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

      return new ApiResponse(500, { error: errorMsg }, 'Payment gateway error');
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
        return new ApiResponse(400, {}, 'Invalid ride fare amount');
      }

      const url = `${this.getBaseUrl()}/transactions`;
      const authHeader = this.getAuthHeader();

      const payload: any = {
        command: 'sale',
        amount: amountToCharge,
        invoice: dto.tripNumber,
        description: `Ride Charge for ${dto.tripNumber}`,
      };

      if (dto.customerId) {
        payload.customer_id = dto.customerId;
      }

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });

      const resData = response.data;
      const isApproved =
        resData && (resData.status === 'Approved' || resData.result_code === 'A' || resData.result === 'Approved');

      ride.paymentType = 'CUSTOMER_ACCOUNT';
      ride.paymentStatus = isApproved ? 'COMPLETED' : 'FAILED';
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
        paymentType: 'CUSTOMER_ACCOUNT',
        status: isApproved ? 'APPROVED' : 'DECLINED',
        transactionId: resData.refnum || '',
        authCode: resData.authcode || '',
        gatewayResponse: resData,
        errorMessage: isApproved ? '' : resData.error || 'Account Charge Declined',
      });
      await log.save();

      if (!isApproved) {
        return new ApiResponse(400, resData, 'Customer account charge declined');
      }

      return new ApiResponse(
        200,
        {
          tripNumber: dto.tripNumber,
          transactionId: resData.refnum,
          authCode: resData.authcode,
          amount: amountToCharge,
        },
        'Ride charged successfully via customer account',
      );
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'USAePay vault charge error';

      return new ApiResponse(500, { error: errorMsg }, 'Vault payment gateway error');
    }
  }

  async refundTransaction(dto: RefundPaymentDto) {
    try {
      const url = `${this.getBaseUrl()}/transactions/${dto.transactionId}/refund`;
      const authHeader = this.getAuthHeader();

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
        paymentType: 'REFUND',
        status: 'REFUNDED',
        transactionId: dto.transactionId,
        gatewayResponse: resData,
      });
      await log.save();

      return new ApiResponse(200, resData, 'Refund processed successfully');
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'Refund execution failed';

      return new ApiResponse(500, { error: errorMsg }, 'Refund gateway error');
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

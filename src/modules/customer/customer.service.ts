import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Customer, CustomerDocument } from './schema/customer.schema';
import {
  CustomerBalanceHistory,
  CustomerBalanceHistoryDocument,
  BalanceAdjustmentType,
} from './schema/customer-balance-history.schema';
import { User, UserDocument } from '../user/schema/user.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaymentService } from '../payment/payment.service';
import { FundCustomerDto } from './dto/fund-customer.dto';
import { DeductCustomerDto } from './dto/deduct-customer.dto';
import { AdjustCustomerBalanceDto } from './dto/adjust-customer-balance.dto';
import { UserRole } from 'src/common/enums/user/role.enum';
import {
  normalizePhoneNumber,
  formatToNational,
  formatToE164,
  isValidPhoneNumber,
  buildPhoneMatchConditions,
} from 'src/common/utils/phone-formatter.util';

@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerBalanceHistory.name)
    private customerBalanceHistoryModel: Model<CustomerBalanceHistoryDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => PaymentService))
    private paymentService: PaymentService,
  ) {}

  async getCustomers(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      const searchFilter: any = {};
      if (query.search) {
        const trimmed = String(query.search).trim();
        const cleanDigits = trimmed.replace(/\D/g, '');
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const orConditions: any[] = [
          { fullName: { $regex: escaped, $options: 'i' } },
          { email: { $regex: escaped, $options: 'i' } },
          { accountNumber: { $regex: escaped, $options: 'i' } },
        ];

        // If numeric ID
        const numId = Number(trimmed);
        if (!isNaN(numId) && Number.isInteger(numId) && cleanDigits.length <= 6) {
          orConditions.push({ customerId: numId });
        }

        // If phone digits provided (support all formats: +1, 1, dashes, parentheses, 10 digits)
        if (cleanDigits.length >= 3) {
          const phoneConditions = buildPhoneMatchConditions(
            trimmed,
            'mobileNumber',
          );
          orConditions.push(...phoneConditions);

          // Partial regex on mobileNumber
          orConditions.push({
            mobileNumber: { $regex: cleanDigits, $options: 'i' },
          });

          // Last 10 digits regex
          if (cleanDigits.length >= 10) {
            const last10 = cleanDigits.slice(-10);
            orConditions.push({
              mobileNumber: { $regex: last10, $options: 'i' },
            });
          }
        } else {
          orConditions.push({
            mobileNumber: { $regex: escaped, $options: 'i' },
          });
        }

        searchFilter.$or = orConditions;
      }

      const total = await this.customerModel.countDocuments(searchFilter);
      const data = await this.customerModel
        .find(searchFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      return new ApiResponse(
        200,
        { data, total, page, limit },
        Msg.CUSTOMERS_FETCHED,
      );
    } catch (error) {
      console.log(`error while getting the customer`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async findOrCreateCustomer(phone: string, name?: string) {
    const normalizedPhone = normalizePhoneNumber(phone) || phone;
    const phoneConditions = buildPhoneMatchConditions(phone, 'mobileNumber');
    let customer = await this.customerModel.findOne({ $or: phoneConditions });
    if (!customer) {
      const lastCustomer = await this.customerModel
        .findOne()
        .sort({ customerId: -1 });
      const newCustomerId =
        lastCustomer && lastCustomer.customerId
          ? lastCustomer.customerId + 1
          : 1;

      customer = new this.customerModel({
        customerId: newCustomerId,
        mobileNumber: normalizedPhone,
        accountNumber: normalizedPhone,
        fullName: name || 'New IVR Customer',
        autoEmail: 'Inactive',
        credit: 0,
        createdBy: 'IVR_SYSTEM',
        createdOn: new Date().toLocaleString(),
      });
      await customer.save();
    }
    return customer;
  }

  async getCustomerById(id: string) {
    try {
      let customer: CustomerDocument | null = null;
      if (isValidObjectId(id)) {
        customer = await this.customerModel.findById(id);
      }
      if (!customer) {
        const numId = parseInt(id) || 0;
        const phoneConditions = buildPhoneMatchConditions(id, 'mobileNumber');
        customer = await this.customerModel.findOne({
          $or: [
            ...(numId > 0 ? [{ customerId: numId }] : []),
            ...phoneConditions,
          ],
        });
      }

      if (!customer) {
        return new ApiResponse(404, {}, Msg.DATA_NOT_FOUND);
      }

      return new ApiResponse(200, customer, Msg.DATA_FETCHED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async createCustomer(dto: CreateCustomerDto) {
    try {
      const normalizedPhone = normalizePhoneNumber(dto.mobileNumber);
      if (!normalizedPhone || normalizedPhone.length < 7) {
        return new ApiResponse(400, {}, 'Valid phone number is required');
      }

      const phoneConditions = buildPhoneMatchConditions(
        dto.mobileNumber,
        'mobileNumber',
      );
      const existing = await this.customerModel.findOne({ $or: phoneConditions });
      if (existing) {
        return new ApiResponse(
          409,
          {
            existingCustomer: {
              _id: existing._id,
              customerId: existing.customerId,
              fullName: existing.fullName,
              mobileNumber: existing.mobileNumber,
            },
          },
          'This phone number already exists.',
        );
      }

      const lastCustomer = await this.customerModel
        .findOne()
        .sort({ customerId: -1 });
      const newCustomerId =
        lastCustomer && lastCustomer.customerId
          ? lastCustomer.customerId + 1
          : 1;

      const addressVal = dto.address || dto.fullAddress || '-';

      const newCustomer = new this.customerModel({
        ...dto,
        customerId: newCustomerId,
        mobileNumber: normalizedPhone,
        address: addressVal,
        fullAddress: addressVal,
        accountNumber: dto.accountNumber || normalizedPhone,
        email: dto.email || '-',
        autoEmail: dto.autoEmail || 'Inactive',
        credit: dto.credit !== undefined ? Number(dto.credit) : 0,
        createdBy: UserRole.ADMIN,
        createdOn: new Date().toLocaleString(),
      });

      await newCustomer.save();
      return new ApiResponse(201, newCustomer, Msg.CUSTOMER_CREATED);
    } catch (error) {
      console.log(`Error while creating the customer:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateCustomer(dto: UpdateCustomerDto) {
    try {
      const existingCustomer = await this.customerModel.findById(dto.id);
      if (!existingCustomer) {
        return new ApiResponse(404, {}, Msg.DATA_NOT_FOUND);
      }

      const updateData: any = { ...dto };

      if (dto.mobileNumber) {
        const normalizedPhone = normalizePhoneNumber(dto.mobileNumber);
        if (!normalizedPhone || normalizedPhone.length < 7) {
          return new ApiResponse(400, {}, 'Valid phone number is required');
        }

        const phoneConditions = buildPhoneMatchConditions(
          dto.mobileNumber,
          'mobileNumber',
        );
        const duplicate = await this.customerModel.findOne({
          _id: { $ne: existingCustomer._id },
          $or: phoneConditions,
        });

        if (duplicate) {
          return new ApiResponse(
            409,
            {
              existingCustomer: {
                _id: duplicate._id,
                customerId: duplicate.customerId,
                fullName: duplicate.fullName,
                mobileNumber: duplicate.mobileNumber,
              },
            },
            'This phone number already exists.',
          );
        }

        updateData.mobileNumber = normalizedPhone;
      }

      if (dto.address !== undefined) {
        updateData.fullAddress = dto.address;
        updateData.address = dto.address;
      } else if (dto.fullAddress !== undefined) {
        updateData.address = dto.fullAddress;
        updateData.fullAddress = dto.fullAddress;
      }

      if (dto.credit !== undefined) {
        updateData.credit = Number(dto.credit);
      }

      const updatedCustomer = await this.customerModel.findByIdAndUpdate(
        existingCustomer._id,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      return new ApiResponse(200, updatedCustomer, Msg.CUSTOMER_UPDATED);
    } catch (error) {
      console.log(`Error while updating the customer:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  formatPhone(phone: string) {
    const normalized = normalizePhoneNumber(phone);
    const national = formatToNational(phone);
    const e164 = formatToE164(phone);
    const isValid = isValidPhoneNumber(phone);
    return new ApiResponse(
      200,
      {
        raw: phone,
        normalized,
        formatted: national,
        national,
        e164,
        isValid,
      },
      'Phone number formatted successfully',
    );
  }

  async deleteCustomer(id: string) {
    try {
      const customer = await this.customerModel.findById(id);
      if (!customer) {
        return new ApiResponse(404, {}, Msg.DATA_NOT_FOUND);
      }

      await this.customerModel.findByIdAndDelete(customer._id);
      return new ApiResponse(
        200,
        {
          _id: customer._id,
          customerId: customer.customerId,
          fullName: customer.fullName,
        },
        Msg.CUSTOMER_DELETED,
      );
    } catch (error) {
      console.log(`Error while deleting the customer:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async findCustomerByIdOrPhone(
    identifier: string,
  ): Promise<CustomerDocument | null> {
    if (!identifier) return null;
    const raw = String(identifier).trim();
    if (isValidObjectId(raw)) {
      const byId = await this.customerModel.findById(raw);
      if (byId) return byId;
    }

    const orConditions: any[] = [
      { customerId: Number(raw) || 0 },
      ...buildPhoneMatchConditions(raw, 'mobileNumber'),
    ];
    return this.customerModel.findOne({ $or: orConditions });
  }

  async getAdminDetails(adminUser?: any) {
    const adminDetails = {
      userId: adminUser?.id || adminUser?._id || '',
      email: adminUser?.email || '',
      role: adminUser?.roles || adminUser?.role || 'ADMIN',
      name: '',
    };

    if (adminDetails.userId && isValidObjectId(adminDetails.userId)) {
      try {
        const dbUser = await this.userModel
          .findById(adminDetails.userId)
          .select('firstName lastName email role')
          .lean();
        if (dbUser) {
          const fullName =
            `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim();
          adminDetails.name = fullName || dbUser.email || '';
          adminDetails.email = dbUser.email || adminDetails.email;
          adminDetails.role = dbUser.role || adminDetails.role;
        }
      } catch (e) {
        // ignore lookup error
      }
    }

    if (!adminDetails.name) {
      adminDetails.name = adminDetails.email || 'Admin';
    }

    return adminDetails;
  }

  async recordBalanceAdjustment(params: {
    customer: CustomerDocument;
    action: BalanceAdjustmentType;
    amount: number;
    previousBalance: number;
    newBalance: number;
    reason?: string;
    adminUser?: any;
  }) {
    const {
      customer,
      action,
      amount,
      previousBalance,
      newBalance,
      reason,
      adminUser,
    } = params;
    const adjustedBy = await this.getAdminDetails(adminUser);

    const historyRecord = new this.customerBalanceHistoryModel({
      customerObjectId: customer._id,
      customerId: customer.customerId,
      mobileNumber: customer.mobileNumber,
      action,
      amount: Number(amount.toFixed(2)),
      previousBalance: Number(previousBalance.toFixed(2)),
      newBalance: Number(newBalance.toFixed(2)),
      reason:
        reason?.trim() ||
        (action === BalanceAdjustmentType.ADD
          ? 'Manual credit added'
          : 'Manual credit deducted'),
      adjustedBy,
    });

    return historyRecord.save();
  }

  async addCredit(dto: FundCustomerDto, adminUser?: any) {
    try {
      const numAmount = Number(dto.amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return new ApiResponse(400, {}, Msg.AMOUNT_POSITIVE_REQUIRED);
      }

      const customer = await this.findCustomerByIdOrPhone(dto.id);
      if (!customer) {
        return new ApiResponse(404, {}, Msg.DATA_NOT_FOUND);
      }

      const previousBalance = Number((customer.credit || 0).toFixed(2));
      const newBalance = Number((previousBalance + numAmount).toFixed(2));

      customer.credit = newBalance;
      await customer.save();

      const adjustmentLog = await this.recordBalanceAdjustment({
        customer,
        action: BalanceAdjustmentType.ADD,
        amount: numAmount,
        previousBalance,
        newBalance,
        reason: dto.reason,
        adminUser,
      });

      return new ApiResponse(
        200,
        {
          _id: customer._id,
          customerId: customer.customerId,
          fullName: customer.fullName,
          mobileNumber: customer.mobileNumber,
          previousBalance,
          credit: customer.credit,
          amountAdded: numAmount,
          customer: {
            _id: customer._id,
            customerId: customer.customerId,
            fullName: customer.fullName,
            mobileNumber: customer.mobileNumber,
            credit: customer.credit,
          },
          adjustment: adjustmentLog,
        },
        Msg.CUSTOMER_CREDIT_ADDED,
      );
    } catch (error) {
      console.log(`Error while adding customer credit:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async deductCredit(dto: DeductCustomerDto, adminUser?: any) {
    try {
      const numAmount = Number(dto.amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return new ApiResponse(400, {}, Msg.AMOUNT_POSITIVE_REQUIRED);
      }

      const customer = await this.findCustomerByIdOrPhone(dto.id);
      if (!customer) {
        return new ApiResponse(404, {}, Msg.DATA_NOT_FOUND);
      }

      const previousBalance = Number((customer.credit || 0).toFixed(2));

      if (numAmount > previousBalance && !dto.allowNegative) {
        return new ApiResponse(
          400,
          {
            customerId: customer.customerId,
            currentBalance: previousBalance,
            attemptedDeduction: numAmount,
          },
          `Cannot deduct $${numAmount.toFixed(2)}. Current customer balance is $${previousBalance.toFixed(2)}.`,
        );
      }

      const newBalance = Number((previousBalance - numAmount).toFixed(2));

      customer.credit = newBalance;
      await customer.save();

      const adjustmentLog = await this.recordBalanceAdjustment({
        customer,
        action: BalanceAdjustmentType.DEDUCT,
        amount: numAmount,
        previousBalance,
        newBalance,
        reason: dto.reason,
        adminUser,
      });

      return new ApiResponse(
        200,
        {
          _id: customer._id,
          customerId: customer.customerId,
          fullName: customer.fullName,
          mobileNumber: customer.mobileNumber,
          previousBalance,
          credit: customer.credit,
          amountDeducted: numAmount,
          customer: {
            _id: customer._id,
            customerId: customer.customerId,
            fullName: customer.fullName,
            mobileNumber: customer.mobileNumber,
            credit: customer.credit,
          },
          adjustment: adjustmentLog,
        },
        Msg.CUSTOMER_CREDIT_DEDUCTED,
      );
    } catch (error) {
      console.log(`Error while deducting customer credit:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async adjustBalance(dto: AdjustCustomerBalanceDto, adminUser?: any) {
    if (dto.action === BalanceAdjustmentType.DEDUCT) {
      return this.deductCredit(
        {
          id: dto.id,
          amount: dto.amount,
          reason: dto.reason,
          allowNegative: dto.allowNegative,
        },
        adminUser,
      );
    }
    return this.addCredit(
      {
        id: dto.id,
        amount: dto.amount,
        reason: dto.reason,
      },
      adminUser,
    );
  }

  async getBalanceHistory(
    customerIdOrPhone: string,
    query?: { page?: number; limit?: number },
  ) {
    try {
      const customer = await this.findCustomerByIdOrPhone(customerIdOrPhone);
      if (!customer) {
        return new ApiResponse(404, {}, Msg.DATA_NOT_FOUND);
      }

      const page = Math.max(1, Number(query?.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(query?.limit) || 20));
      const skip = (page - 1) * limit;

      const filter: any = {
        $or: [
          { customerObjectId: customer._id },
          ...(customer.customerId ? [{ customerId: customer.customerId }] : []),
          ...(customer.mobileNumber
            ? [{ mobileNumber: customer.mobileNumber }]
            : []),
        ],
      };

      const [total, history] = await Promise.all([
        this.customerBalanceHistoryModel.countDocuments(filter),
        this.customerBalanceHistoryModel
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      return new ApiResponse(
        200,
        {
          customer: {
            _id: customer._id,
            customerId: customer.customerId,
            fullName: customer.fullName,
            mobileNumber: customer.mobileNumber,
            currentBalance: customer.credit || 0,
          },
          history,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 1,
          },
        },
        Msg.CUSTOMER_BALANCE_HISTORY_FETCHED,
      );
    } catch (error) {
      console.log(`Error while fetching customer balance history:`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async fundCreditFromCard(dto: FundCustomerDto, adminUser?: any) {
    const res: any = await this.paymentService.fundCustomerCreditFromVault({
      customerId: dto.id,
      amount: dto.amount,
    });

    if (res?.statusCode === 200 && res?.data) {
      try {
        const customer = await this.findCustomerByIdOrPhone(dto.id);
        if (customer) {
          const numAmount = Number(dto.amount);
          const newBalance = Number(customer.credit || 0);
          const previousBalance = Number((newBalance - numAmount).toFixed(2));
          await this.recordBalanceAdjustment({
            customer,
            action: BalanceAdjustmentType.ADD,
            amount: numAmount,
            previousBalance,
            newBalance,
            reason:
              dto.reason ||
              `Funded via saved credit card (Auth: ${res.data.authCode || res.data.transactionId || ''})`,
            adminUser: adminUser || {
              name: 'Card on File (USAePay)',
              role: 'PAYMENT_GATEWAY',
            },
          });
        }
      } catch (histErr) {
        console.log(`Failed to record vault funding history:`, histErr);
      }
    }

    return res;
  }
}

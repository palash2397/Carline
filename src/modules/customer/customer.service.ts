import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Customer, CustomerDocument } from './schema/customer.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  async getCustomers(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      const searchFilter: any = {};
      if (query.search) {
        searchFilter.$or = [
          { fullName: { $regex: query.search, $options: 'i' } },
          { email: { $regex: query.search, $options: 'i' } },
          { mobileNumber: { $regex: query.search, $options: 'i' } },
          { accountNumber: { $regex: query.search, $options: 'i' } },
        ];
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
        Msg.DATA_FETCHED,
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async findOrCreateCustomer(phone: string, name?: string) {
    let customer = await this.customerModel.findOne({ mobileNumber: phone });
    if (!customer) {
      // Find the highest customerId to auto-increment
      const lastCustomer = await this.customerModel
        .findOne()
        .sort({ customerId: -1 });
      const newCustomerId =
        lastCustomer && lastCustomer.customerId
          ? lastCustomer.customerId + 1
          : 1;

      customer = new this.customerModel({
        customerId: newCustomerId,
        mobileNumber: phone,
        accountNumber: phone,
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
      const customer = await this.customerModel.findById(id);

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
      if (!dto.fullName || !dto.mobileNumber) {
        return new ApiResponse(
          400,
          {},
          'fullName and mobileNumber are required',
        );
      }

      // Check if customer already exists with this mobile number
      const existing = await this.customerModel.findOne({
        mobileNumber: dto.mobileNumber,
      });
      if (existing) {
        return new ApiResponse(
          409,
          {},
          'Customer with this mobile number already exists',
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
        address: addressVal,
        fullAddress: addressVal,
        accountNumber: dto.accountNumber || dto.mobileNumber,
        email: dto.email || '-',
        autoEmail: dto.autoEmail || 'Inactive',
        credit: dto.credit !== undefined ? Number(dto.credit) : 0,
        createdBy: 'ADMIN',
        createdOn: new Date().toLocaleString(),
      });

      await newCustomer.save();
      return new ApiResponse(201, newCustomer, 'Customer created successfully');
    } catch (error) {
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

      return new ApiResponse(
        200,
        updatedCustomer,
        'Customer profile updated successfully',
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async deleteCustomer(id: string) {
    try {
      let customer: CustomerDocument | null = null;
      if (isValidObjectId(id)) {
        customer = await this.customerModel.findById(id);
      }
      if (!customer) {
        customer = await this.customerModel.findOne({
          $or: [{ customerId: parseInt(id) || 0 }, { mobileNumber: id }],
        });
      }

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
        'Customer deleted successfully',
      );
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

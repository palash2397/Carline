import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from './schema/customer.schema';
import { ApiResponse } from '../../helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';

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
        .sort({ createdAt: -1 })
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
      const lastCustomer = await this.customerModel.findOne().sort({ customerId: -1 });
      const newCustomerId = lastCustomer && lastCustomer.customerId ? lastCustomer.customerId + 1 : 1;

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
}

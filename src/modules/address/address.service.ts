import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';

import { Address, AddressDocument } from './schema/address.schema';
import { User, UserDocument } from '../user/schema/user.schema';

import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressService {
  constructor(
    @InjectModel(Address.name)
    private readonly addressModel: Model<AddressDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async createAddress(userId: any, dto: CreateAddressDto) {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        return new ApiResponse(404, {}, Msg.USER_NOT_FOUND);
      }
      const address = new this.addressModel({
        user: userId,
        streetAddress: dto.streetAddress,
        postcode: dto.postcode,
        city: dto.city,
        country: dto.country,
        addressType: dto.addressType,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
      await address.save();
      return new ApiResponse(200, {}, Msg.ADDRESS_CREATED);
    } catch (error) {
      console.log(`error while creating the address`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async myAddress(userId: any) {
    try {
      const addresses = await this.addressModel
        .find({ user: userId })
        .sort({ createdAt: -1 });

      if (!addresses || addresses.length === 0) {
        return new ApiResponse(404, {}, Msg.ADDRESS_NOT_FOUND);
      }

      return new ApiResponse(200, addresses, Msg.ADDRESS_FETCHED);
    } catch (error) {
      console.log(`error while fetching the addresses`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    try {
      const address = await this.addressModel.findOneAndUpdate(
        {
          _id: addressId,
          user: userId,
        },
        {
          ...dto,
        },
        {
          new: true,
        },
      );

      if (!address) {
        return new ApiResponse(404, {}, Msg.ADDRESS_NOT_FOUND);
      }

      return new ApiResponse(200, address, Msg.ADDRESS_UPDATED);
    } catch (error) {
      console.log('error while updating address', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async deleteAddress(userId: string, addressId: string) {
    try {
      const address = await this.addressModel.findOneAndDelete({
        _id: addressId,
        user: userId,
      });

      if (!address) {
        return new ApiResponse(404, {}, Msg.ADDRESS_NOT_FOUND);
      }

      return new ApiResponse(200, {}, Msg.ADDRESS_DELETED);
    } catch (error) {
      console.log('error while deleting address', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

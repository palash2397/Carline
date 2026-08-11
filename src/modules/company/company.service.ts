import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from './schema/company.schema';
import { CompanyCar, CompanyCarDocument } from './schema/company-car.schema';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { AddCompanyCarDto } from './dto/add-company-car.dto';
import { UpdateCompanyCarDto } from './dto/update-company-car.dto';
import { LoginCompanyDto } from './dto/login-company.dto';
import { ApiResponse } from 'src/helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

@Injectable()
export class CompanyService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(CompanyCar.name)
    private readonly companyCarModel: Model<CompanyCarDocument>,
  ) {}

  async register(dto: RegisterCompanyDto, files: Express.Multer.File[]) {
    try {
      const existingCompany = await this.companyModel.findOne({
        email: dto.email,
      });
      if (existingCompany) {
        return new ApiResponse(400, {}, Msg.COMPANY_EXISTS);
      }

      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const documentFiles = files?.map((file) => file.filename) || [];

      const company = new this.companyModel({
        ...dto,
        password: hashedPassword,
        documents: documentFiles,
      });

      await company.save();

      // Avoid returning the password
      const companyData = company.toObject();
      delete (companyData as any).password;

      return new ApiResponse(
        201,
        { company: companyData },
        Msg.COMPANY_REGISTERED,
      );
    } catch (error) {
      console.log('Error while registering company', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async login(dto: LoginCompanyDto) {
    try {
      const company = await this.companyModel
        .findOne({ email: dto.email })
        .select('+password');

      if (!company) {
        return new ApiResponse(404, {}, Msg.COMPANY_NOT_FOUND);
      }

      const isPasswordValid = await bcrypt.compare(
        dto.password,
        company.password,
      );
      if (!isPasswordValid) {
        return new ApiResponse(400, {}, Msg.INVALID_CREDENTIALS);
      }

      const token = jwt.sign(
        {
          id: company._id.toString(),
          role: company.role,
          email: company.email,
        },
        process.env.JWT_SECRET!,
        {
          expiresIn: '10d',
        },
      );

      const baseUrl = process.env.BASE_URL;
      const formattedDocuments = company.documents.map(
        (doc) => `${baseUrl}/api/v1/uploads/company/${doc}`,
      );

      const companyData = {
        _id: company._id,
        adminName: company.adminName,
        companyName: company.companyName,
        email: company.email,
        ownerName: company.ownerName,
        phoneNumber: company.phoneNumber,
        gstNumber: company.gstNumber,
        address: company.address,
        isActive: company.isActive,
        isVerified: company.isVerified,
        role: company.role,
        documents: formattedDocuments,
        token,
      };

      return new ApiResponse(200, { companyData }, Msg.LOGIN_SUCCESS);
    } catch (error) {
      console.log('Error while company login', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async myProfile(id: string) {
    try {
      const company = await this.companyModel.findById(id);

      if (!company) {
        return new ApiResponse(404, {}, Msg.COMPANY_NOT_FOUND);
      }

      const formattedDocuments = company.documents.map(
        (doc) => `${process.env.BASE_URL}/api/v1/uploads/company/${doc}`,
      );

      const companyData = {
        _id: company._id,
        adminName: company.adminName,
        companyName: company.companyName,
        email: company.email,
        ownerName: company.ownerName,
        phoneNumber: company.phoneNumber,
        gstNumber: company.gstNumber,
        city: company.city,
        address: company.address,
        isActive: company.isActive,
        isVerified: company.isVerified,
        role: company.role,
        documents: formattedDocuments,
      };

      return new ApiResponse(200, { companyData }, Msg.DATA_FETCHED);
    } catch (error) {
      console.log(`error while fetching company profile`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async addCar(
    companyId: string,
    dto: AddCompanyCarDto,
    files: {
      vehiclePhotos?: Express.Multer.File[];
      insuranceInvoice?: Express.Multer.File[];
      registrationCardImage?: Express.Multer.File[];
    },
  ) {
    try {
      const company = await this.companyModel.findById(companyId);
      if (!company) {
        return new ApiResponse(404, {}, Msg.COMPANY_NOT_FOUND);
      }

      const vehiclePhotos =
        files.vehiclePhotos?.map((file) => file.filename) || [];
      const insuranceInvoice = files.insuranceInvoice?.[0]?.filename || null;
      const registrationCardImage =
        files.registrationCardImage?.[0]?.filename || null;

      const newCar = new this.companyCarModel({
        ...dto,
        companyId: new Types.ObjectId(companyId),
        vehiclePhotos,
        insuranceInvoice,
        registrationCardImage,
      });

      await newCar.save();

      return new ApiResponse(201, { car: newCar }, Msg.DATA_ADDED);
    } catch (error) {
      console.log('Error while adding company car', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async carsByCompany(companyId: string) {
    try {
      const cars = await this.companyCarModel
        .find({ companyId: new Types.ObjectId(companyId) })
        .lean();

      if (!cars || cars.length === 0) {
        return new ApiResponse(404, {}, Msg.NO_CARS_FOUND);
      }

      const baseUrl = process.env.BASE_URL || '';
      const formattedCars = cars.map((car) => ({
        ...car,
        vehiclePhotos:
          car.vehiclePhotos?.map(
            (photo) => `${baseUrl}/api/v1/uploads/company-car/${photo}`,
          ) || [],
        insuranceInvoice: car.insuranceInvoice
          ? `${baseUrl}/api/v1/uploads/company-car/${car.insuranceInvoice}`
          : null,
        registrationCardImage: car.registrationCardImage
          ? `${baseUrl}/api/v1/uploads/company-car/${car.registrationCardImage}`
          : null,
      }));

      return new ApiResponse(
        200,
        { cars: formattedCars },
        Msg.COMPANY_CARS_FETCHED,
      );
    } catch (error) {
      console.log('Error fetching cars by company id', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async searchCarsByCity(city: string) {
    try {
      const companies = await this.companyModel.find({
        city: { $regex: city, $options: 'i' },
      });

      console.log('---->', companies);

      const companyIds = companies.map((c) => c._id);

      const cars = await this.companyCarModel
        .find({ companyId: { $in: companyIds } })
        .populate({
          path: 'companyId',
          select: 'companyName email phoneNumber city address',
        })
        .lean();

      if (!cars || cars.length === 0) {
        return new ApiResponse(404, {}, Msg.NO_CARS_FOUND);
      }

      const baseUrl = process.env.BASE_URL || '';
      const formattedCars = cars.map((car) => ({
        ...car,
        vehiclePhotos:
          car.vehiclePhotos?.map(
            (photo) => `${baseUrl}/api/v1/uploads/company-car/${photo}`,
          ) || [],
        insuranceInvoice: car.insuranceInvoice
          ? `${baseUrl}/api/v1/uploads/company-car/${car.insuranceInvoice}`
          : null,
        registrationCardImage: car.registrationCardImage
          ? `${baseUrl}/api/v1/uploads/company-car/${car.registrationCardImage}`
          : null,
      }));

      return new ApiResponse(200, { cars: formattedCars }, Msg.DATA_FETCHED);
    } catch (error) {
      console.log('Error searching cars by city', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async carById(carId: string) {
    try {
      const car = await this.companyCarModel.findById(carId).populate({
        path: 'companyId',
        select: 'companyName email phoneNumber city address',
      });

      if (!car) {
        return new ApiResponse(404, {}, Msg.CAR_NOT_FOUND);
      }

      const baseUrl = process.env.BASE_URL || '';
      const formattedCar = {
        ...car,
        vehiclePhotos:
          car.vehiclePhotos?.map(
            (photo) => `${baseUrl}/api/v1/uploads/company-car/${photo}`,
          ) || [],
        insuranceInvoice: car.insuranceInvoice
          ? `${baseUrl}/api/v1/uploads/company-car/${car.insuranceInvoice}`
          : null,
        registrationCardImage: car.registrationCardImage
          ? `${baseUrl}/api/v1/uploads/company-car/${car.registrationCardImage}`
          : null,
      };

      return new ApiResponse(200, { car: formattedCar }, Msg.DATA_FETCHED);
    } catch (error) {
      console.log('Error while fetching car by id', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateCar(
    companyId: string,
    carId: string,
    dto: UpdateCompanyCarDto,
    files: {
      vehiclePhotos?: Express.Multer.File[];
      insuranceInvoice?: Express.Multer.File[];
      registrationCardImage?: Express.Multer.File[];
    },
  ) {
    try {
      const car = await this.companyCarModel.findOne({
        _id: carId,
        companyId: new Types.ObjectId(companyId),
      });

      if (!car) {
        return new ApiResponse(404, {}, Msg.CAR_NOT_FOUND);
      }

      // Update fields
      if (dto.carName) car.carName = dto.carName;
      if (dto.vehicleBrand) car.vehicleBrand = dto.vehicleBrand;
      if (dto.vehicleModel) car.vehicleModel = dto.vehicleModel;
      if (dto.manufacturingYear) car.manufacturingYear = dto.manufacturingYear;
      if (dto.color) car.color = dto.color;
      if (dto.vinNumber) car.vinNumber = dto.vinNumber;
      if (dto.registrationNo) car.registrationNo = dto.registrationNo;
      if (dto.perDayCharge) car.perDayCharge = dto.perDayCharge;
      if (dto.fuelType) car.fuelType = dto.fuelType;
      if (dto.transmission) car.transmission = dto.transmission;
      if (dto.noOfSeats) car.noOfSeats = dto.noOfSeats;
      if (dto.noOfDoors) car.noOfDoors = dto.noOfDoors;
      if (dto.mileage) car.mileage = dto.mileage;
      if (dto.airConditioning !== undefined)
        car.airConditioning = dto.airConditioning;
      if (dto.bluetooth !== undefined) car.bluetooth = dto.bluetooth;
      if (dto.usb !== undefined) car.usb = dto.usb;
      if (dto.gps !== undefined) car.gps = dto.gps;
      if (dto.description !== undefined) car.description = dto.description;

      // Update files if provided
      if (files?.vehiclePhotos && files.vehiclePhotos.length > 0) {
        car.vehiclePhotos = files.vehiclePhotos.map((file) => file.filename);
      }
      if (files?.insuranceInvoice && files.insuranceInvoice.length > 0) {
        car.insuranceInvoice = files.insuranceInvoice[0].filename;
      }
      if (
        files?.registrationCardImage &&
        files.registrationCardImage.length > 0
      ) {
        car.registrationCardImage = files.registrationCardImage[0].filename;
      }

      await car.save();

      return new ApiResponse(200, { car }, Msg.DATA_UPDATED);
    } catch (error) {
      console.log('Error while updating company car', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

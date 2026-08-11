import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { deleteOldFile } from 'src/helpers/index';

import { RideType, RideTypeDocument } from './schema/ride-type.schema';
import { CreateRideTypeDto } from './dto/create-ride-type.dto';
import { UpdateRideTypeDto } from './dto/update-ride-type.dto';
import { EstimateFareDto } from './dto/estimate-fare.dto';

@Injectable()
export class RideTypeService {
  constructor(
    @InjectModel(RideType.name) private rideTypeModel: Model<RideTypeDocument>,
  ) {}

  async createRideType(dto: CreateRideTypeDto, file?: Express.Multer.File) {
    try {
      const payload: any = { ...dto };
      if (file) {
        payload.image = file.filename;
      }

      const rideType = await this.rideTypeModel.create(payload);
      return new ApiResponse(201, rideType, Msg.RIDE_TYPE_CREATED);
    } catch (error) {
      console.log('Error creating ride type:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async getRideTypes() {
    try {
      const rideTypes = await this.rideTypeModel.find().lean();

      const baseUrl = process.env.BASE_URL;
      const formattedRideTypes = rideTypes.map((rt) => {
        if (rt.image) {
          rt.image = `${baseUrl}/api/v1/uploads/ride-type/${rt.image}`;
        }
        return rt;
      });

      return new ApiResponse(200, formattedRideTypes, Msg.RIDE_TYPE_FETCHED);
    } catch (error) {
      console.log('Error fetching ride types:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateRideType(
    id: string,
    dto: UpdateRideTypeDto,
    file?: Express.Multer.File,
  ) {
    try {
      const rideType = await this.rideTypeModel.findById(id);
      if (!rideType) {
        return new ApiResponse(404, {}, Msg.RIDE_TYPE_NOT_FOUND);
      }

      const payload: any = { ...dto };

      if (file) {
        if (rideType.image) {
          deleteOldFile('ride-type', rideType.image);
        }
        payload.image = file.filename;
      }

      const updatedRideType = await this.rideTypeModel.findByIdAndUpdate(
        id,
        payload,
        { new: true },
      );

      return new ApiResponse(200, updatedRideType, Msg.RIDE_TYPE_UPDATED);
    } catch (error) {
      console.log('Error updating ride type:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async deleteRideType(id: string) {
    try {
      const rideType = await this.rideTypeModel.findById(id);
      if (!rideType) {
        return new ApiResponse(404, {}, Msg.RIDE_TYPE_NOT_FOUND);
      }

      if (rideType.image) {
        deleteOldFile('ride-type', rideType.image);
      }

      await this.rideTypeModel.findByIdAndDelete(id);
      return new ApiResponse(200, {}, Msg.RIDE_TYPE_DELETED);
    } catch (error) {
      console.log('Error deleting ride type:', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async estimateFare(dto: EstimateFareDto) {
    try {
      const response = await axios.post(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          origin: {
            location: {
              latLng: {
                latitude: dto.pickupLatitude,
                longitude: dto.pickupLongitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: dto.destinationLatitude,
                longitude: dto.destinationLongitude,
              },
            },
          },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
          },
        },
      );

      const route = response.data.routes?.[0];

      if (!route) {
        return new ApiResponse(400, {}, Msg.ROUTE_NOT_FOUND);
      }

      const distance = route.distanceMeters / 1000;

      const duration = Math.ceil(Number(route.duration.replace('s', '')) / 60);

      const rideTypes = await this.rideTypeModel.find().lean();

      const rides = rideTypes.map((rideType) => {
        const fare =
          rideType.baseFare +
          distance * rideType.perKmCharge +
          duration * rideType.perMinuteCharge;

        const finalFare = Math.max(fare, rideType.minimumFare);

        return {
          _id: rideType._id,
          title: rideType.title,
          seats: rideType.seats,

          image: rideType.image
            ? `${process.env.BASE_URL}/api/v1/uploads/ride-type/${rideType.image}`
            : null,

          distance: Number(distance.toFixed(2)),
          estimatedTime: duration,
          estimatedFare: Number(finalFare.toFixed(2)),
        };
      });

      return new ApiResponse(200, rides, Msg.FARE_ESTIMATED);
    } catch (error) {
      console.log('Error estimating fare:', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

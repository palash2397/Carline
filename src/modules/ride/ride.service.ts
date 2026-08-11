import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';
import { UserRole } from 'src/common/enums/user/role.enum';

import { BookRideDto } from './dto/book-ride.dto';

import { RideStatus } from 'src/common/enums/ride/ride-enum';
import { VerificationStatus } from 'src/common/enums/driver/verification-status.enum';
import { Ride, RideDocument } from './schema/ride.schema';

import { AcceptRideDto } from './dto/accept-ride.dto';
import { RejectRideDto } from './dto/reject-ride.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';
import { CounterFareDto } from './dto/counter-fare.dto';
import { UpdateRideStatusDto } from './dto/ride-status-dto';

import {
  RideType,
  RideTypeDocument,
} from '../ride-type/schema/ride-type.schema';

import { Driver, DriverDocument } from '../driver/schema/driver.schema';
import { User, UserDocument } from '../user/schema/user.schema';

import { CounterBy } from 'src/common/enums/ride/counter-enum';

import { SocketService } from '../socket/socket.service';

@Injectable()
export class RideService {
  constructor(
    @InjectModel(Ride.name)
    private readonly rideModel: Model<RideDocument>,

    @InjectModel(RideType.name)
    private readonly rideTypeModel: Model<RideTypeDocument>,

    @InjectModel(Driver.name)
    private readonly driverModel: Model<DriverDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly socketService: SocketService,
  ) {}

  private async moveToNextDriver(ride: RideDocument) {
    ride.currentDriverIndex++;

    ride.driver = null;

    ride.negotiatingDriver = null;

    ride.currentFare = ride.estimatedFare;

    ride.negotiationRound = 0;

    ride.lastCounterBy = CounterBy.USER;

    ride.status = RideStatus.SEARCHING_DRIVER;

    ride.fareHistory = [];

    if (ride.currentDriverIndex >= ride.driverQueue.length) {
      await ride.save();

      this.socketService.emitToUser(ride.user.toString(), 'noDriverFound', {
        rideId: ride._id,
      });

      return;
    }

    const nextDriver = await this.driverModel
      .findById(ride.driverQueue[ride.currentDriverIndex])
      .populate('user');

    if (!nextDriver) {
      return await this.moveToNextDriver(ride);
    }

    ride.negotiatingDriver = nextDriver._id;

    await ride.save();

    this.socketService.emitToUser(
      nextDriver.user['_id'].toString(),
      'newRideRequest',
      {
        rideId: ride._id,

        pickupAddress: ride.pickupAddress,
        pickupLatitude: ride.pickupLatitude,
        pickupLongitude: ride.pickupLongitude,

        destinationAddress: ride.destinationAddress,
        destinationLatitude: ride.destinationLatitude,
        destinationLongitude: ride.destinationLongitude,

        distance: ride.distance,
        estimatedTime: ride.estimatedTime,

        estimatedFare: ride.estimatedFare,

        currentFare: ride.currentFare,
      },
    );
  }

  async bookRide(userId: string, dto: BookRideDto) {
    try {
      const rideType = await this.rideTypeModel.findById(dto.rideType);

      if (!rideType) {
        return new ApiResponse(404, {}, Msg.RIDE_TYPE_NOT_FOUND);
      }

      const activeRide = await this.rideModel.findOne({
        user: userId,
        status: {
          $in: [
            RideStatus.SEARCHING_DRIVER,
            RideStatus.DRIVER_FOUND,
            RideStatus.DRIVER_ARRIVED,
            RideStatus.ONGOING,
          ],
        },
      });

      if (activeRide) {
        return new ApiResponse(400, {}, Msg.ACTIVE_RIDE_EXISTS);
      }

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

      const estimatedTime = Math.ceil(
        Number(route.duration.replace('s', '')) / 60,
      );

      const fare =
        rideType.baseFare +
        distance * rideType.perKmCharge +
        estimatedTime * rideType.perMinuteCharge;

      const estimatedFare = Math.max(fare, rideType.minimumFare);

      const ride = await this.rideModel.create({
        user: userId,
        rideType: dto.rideType,

        pickupLocation: {
          type: 'Point',
          coordinates: [dto.pickupLongitude, dto.pickupLatitude],
        },

        pickupAddress: dto.pickupAddress,
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,

        destinationAddress: dto.destinationAddress,
        destinationLatitude: dto.destinationLatitude,
        destinationLongitude: dto.destinationLongitude,

        distance: Number(distance.toFixed(2)),
        estimatedTime,
        estimatedFare: Number(estimatedFare.toFixed(2)),
        currentFare: Number(estimatedFare.toFixed(2)),

        status: RideStatus.SEARCHING_DRIVER,
      });

      const nearbyDrivers = await this.driverModel
        .find({
          isOnline: true,
          user: { $ne: userId },
          // verificationStatus: VerificationStatus.APPROVED,

          currentLocation: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [dto.pickupLongitude, dto.pickupLatitude],
              },
              $maxDistance: 5000,
            },
          },
        })
        .populate('user')
        .lean();

      // console.log('nearby drivers count ---------->', nearbyDrivers.length);

      // console.log(
      //   'nearby drivers ---------->',
      //   JSON.stringify(nearbyDrivers, null, 2),
      // );

      // for (const driver of nearbyDrivers) {
      //   const driverUser: any = driver.user;

      //   if (!driverUser?._id) {
      //     continue;
      //   }

      //   this.socketService.emitToUser(
      //     driverUser._id.toString(),
      //     'newRideRequest',
      //     {
      //       rideId: ride._id,

      //       pickupAddress: ride.pickupAddress,
      //       pickupLatitude: ride.pickupLatitude,
      //       pickupLongitude: ride.pickupLongitude,

      //       destinationAddress: ride.destinationAddress,
      //       destinationLatitude: ride.destinationLatitude,
      //       destinationLongitude: ride.destinationLongitude,

      //       distance: ride.distance,
      //       estimatedTime: ride.estimatedTime,
      //       estimatedFare: ride.estimatedFare,

      //       rideType: {
      //         _id: rideType._id,
      //         title: rideType.title,
      //       },
      //     },
      //   );
      // }

      const driverQueue = nearbyDrivers.map((driver: any) => driver._id);

      ride.driverQueue = driverQueue;
      ride.currentDriverIndex = 0;
      ride.currentFare = ride.estimatedFare;

      if (driverQueue.length) {
        ride.negotiatingDriver = driverQueue[0];
      }

      await ride.save();

      if (nearbyDrivers.length) {
        const firstDriver: any = nearbyDrivers[0];

        this.socketService.emitToUser(
          firstDriver.user._id.toString(),
          'newRideRequest',
          {
            rideId: ride._id,

            pickupAddress: ride.pickupAddress,
            pickupLatitude: ride.pickupLatitude,
            pickupLongitude: ride.pickupLongitude,

            destinationAddress: ride.destinationAddress,
            destinationLatitude: ride.destinationLatitude,
            destinationLongitude: ride.destinationLongitude,

            distance: ride.distance,
            estimatedTime: ride.estimatedTime,

            estimatedFare: ride.estimatedFare,
            currentFare: ride.currentFare,

            rideType: {
              _id: rideType._id,
              title: rideType.title,
            },
          },
        );
      }

      return new ApiResponse(
        201,
        {
          ride,
          nearbyDriversCount: nearbyDrivers.length,
        },
        Msg.RIDE_BOOKED,
      );
    } catch (error) {
      console.log('error while booking ride', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  // async acceptRide(userId: string, dto: AcceptRideDto) {
  //   try {
  //     const driver = await this.driverModel.findOne({
  //       user: userId,
  //       isOnline: true,
  //       // verificationStatus: VerificationStatus.APPROVED,
  //     });

  //     if (!driver) {
  //       return new ApiResponse(404, {}, Msg.DRIVER_NOT_AVAILABLE);
  //     }

  //     const ride = await this.rideModel.findOneAndUpdate(
  //       {
  //         _id: dto.rideId,
  //         driver: null,
  //         status: RideStatus.SEARCHING_DRIVER,
  //       },
  //       {
  //         driver: driver._id,
  //         status: RideStatus.DRIVER_FOUND,
  //       },
  //       {
  //         new: true,
  //       },
  //     );

  //     if (!ride) {
  //       return new ApiResponse(404, {}, Msg.RIDE_ALREADY_ACCEPTED);
  //     }

  //     const rideData = await this.rideModel
  //       .findById(ride._id)
  //       .populate({
  //         path: 'driver',
  //         populate: {
  //           path: 'user',
  //           select: 'firstName lastName email avatar phoneNumber countryCode',
  //         },
  //       })
  //       .populate('rideType')
  //       .lean();

  //     this.socketService.emitToUser(
  //       ride.user.toString(),
  //       'driverFound',
  //       rideData,
  //     );

  //     return new ApiResponse(
  //       201,
  //       {
  //         ride,
  //         driver,
  //         rideData,
  //       },
  //       Msg.RIDE_ACCEPTED,
  //     );
  //   } catch (error) {
  //     console.log('error while accepting ride', error);

  //     return new ApiResponse(500, {}, Msg.SERVER_ERROR);
  //   }
  // }

  async acceptRide(userId: string, dto: AcceptRideDto) {
    try {
      const driver = await this.driverModel.findOne({
        user: userId,
        isOnline: true,
      });

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_AVAILABLE);
      }

      const ride = await this.rideModel.findById(dto.rideId);

      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (
        ![RideStatus.SEARCHING_DRIVER, RideStatus.FARE_NEGOTIATION].includes(
          ride.status,
        )
      ) {
        return new ApiResponse(400, {}, Msg.INVALID_RIDE_STATUS);
      }

      if (ride.driver) {
        return new ApiResponse(400, {}, Msg.RIDE_ALREADY_ACCEPTED);
      }

      const currentDriverId =
        ride.driverQueue[ride.currentDriverIndex]?.toString();

      if (!currentDriverId) {
        return new ApiResponse(400, {}, Msg.DRIVER_NOT_AVAILABLE);
      }

      if (currentDriverId !== driver._id.toString()) {
        return new ApiResponse(400, {}, Msg.RIDE_NOT_ASSIGNED_TO_DRIVER);
      }

      ride.driver = driver._id;
      ride.status = RideStatus.DRIVER_FOUND;
      ride.negotiatingDriver = undefined;

      await ride.save();

      const rideData = await this.rideModel
        .findById(ride._id)
        .populate({
          path: 'driver',
          populate: {
            path: 'user',
            select: 'firstName lastName email avatar phoneNumber countryCode',
          },
        })
        .populate('rideType')
        .lean();

      this.socketService.emitToUser(
        ride.user.toString(),
        'driverFound',
        rideData,
      );

      return new ApiResponse(
        200,
        {
          ride,
          driver,
          rideData,
        },
        Msg.RIDE_ACCEPTED,
      );
    } catch (error) {
      console.log('error while accepting ride', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async rejectRide(userId: string, dto: RejectRideDto) {
    try {
      const ride = await this.rideModel.findById(dto.rideId);

      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (ride.status !== RideStatus.SEARCHING_DRIVER) {
        return new ApiResponse(400, {}, Msg.INVALID_RIDE_STATUS);
      }

      let isDriver = false;
      if (ride.negotiatingDriver) {
        const driver = await this.driverModel.findOne({
          user: userId,
        });

        isDriver =
          !!driver &&
          driver._id.toString() === ride.negotiatingDriver.toString();
      }

      if (!isDriver) {
        return new ApiResponse(401, {}, Msg.UNAUTHORIZED);
      }

      this.socketService.emitToUser(
        ride.user.toString(),
        'fareRejected',
        { rideId: ride._id }
      );

      await this.moveToNextDriver(ride);

      return new ApiResponse(200, {}, Msg.RIDE_STATUS_UPDATED_SUCCESSFULLY);
    } catch (error) {
      console.log('error while rejecting ride', error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async cancelRide(userId: string, dto: CancelRideDto) {
    try {
      const ride = await this.rideModel
        .findById(dto.rideId)
        .populate('user')
        .populate('driver');

      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (ride.status === RideStatus.COMPLETED) {
        return new ApiResponse(400, {}, Msg.RIDE_ALREADY_COMPLETED);
      }

      if (ride.status === RideStatus.CANCELLED) {
        return new ApiResponse(400, {}, Msg.RIDE_ALREADY_CANCELLED);
      }

      const driver = await this.driverModel.findOne({
        user: userId,
      });

      /**
       * USER CANCELLED
       */

      console.log('USER CANCELLED', ride.user._id.toString(), userId);
      if (ride.user._id.toString() === userId) {
        ride.status = RideStatus.CANCELLED;
        ride.cancelledBy = UserRole.USER;
        ride.cancelReason = dto.reason || '';

        await ride.save();

        if (ride.driver) {
          this.socketService.emitToUser(
            (ride.driver as any).user.toString(),
            'passengerCancelledRide',
            ride,
          );

          console.log('Ride Driver:', ride.driver);
        } else {
          const nearbyDrivers = await this.driverModel
            .find({
              isOnline: true,
              // verificationStatus: VerificationStatus.APPROVED,
              currentLocation: {
                $near: {
                  $geometry: {
                    type: 'Point',
                    coordinates: [ride.pickupLongitude, ride.pickupLatitude],
                  },
                  $maxDistance: 5000,
                },
              },
            })
            .populate('user');

          for (const nearbyDriver of nearbyDrivers) {
            if ((nearbyDriver as any).user?._id) {
              this.socketService.emitToUser(
                (nearbyDriver as any).user._id.toString(),
                'rideCancelled',
                ride,
              );
            }
          }
        }

        return new ApiResponse(200, ride, Msg.RIDE_CANCELLED);
      }

      /**
       * DRIVER CANCELLED
       */
      if (
        driver &&
        ride.driver &&
        (ride.driver as any)._id.toString() === driver._id.toString()
      ) {
        ride.driver = null as any;

        ride.status = RideStatus.SEARCHING_DRIVER;

        ride.rejectedDrivers.push(driver._id);

        await ride.save();

        this.socketService.emitToUser(
          ride.user._id.toString(),
          'searchingNewDriver',
          ride,
        );

        /**
         * search another driver
         */

        const nearbyDrivers = await this.driverModel
          .find({
            _id: {
              $nin: ride.rejectedDrivers,
            },

            isOnline: true,

            verificationStatus: VerificationStatus.APPROVED,

            currentLocation: {
              $near: {
                $geometry: {
                  type: 'Point',

                  coordinates: [ride.pickupLongitude, ride.pickupLatitude],
                },

                $maxDistance: 5000,
              },
            },
          })
          .populate('user');

        for (const nearbyDriver of nearbyDrivers) {
          this.socketService.emitToUser(
            nearbyDriver.user._id.toString(),

            'newRideRequest',

            {
              rideId: ride._id,

              pickupAddress: ride.pickupAddress,

              pickupLatitude: ride.pickupLatitude,

              pickupLongitude: ride.pickupLongitude,

              destinationAddress: ride.destinationAddress,

              destinationLatitude: ride.destinationLatitude,

              destinationLongitude: ride.destinationLongitude,

              distance: ride.distance,

              estimatedTime: ride.estimatedTime,

              estimatedFare: ride.estimatedFare,

              rideType: ride.rideType,
            },
          );
        }

        return new ApiResponse(200, ride, Msg.RIDE_CANCELLED);
      }

      return new ApiResponse(403, {}, Msg.UNAUTHORIZED);
    } catch (error) {
      console.log(error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async driverActiveRide(userId: string) {
    try {
      const driver = await this.driverModel.findOne({
        user: userId,
      });
      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const ride = await this.rideModel
        .findOne({
          driver: driver._id,
          status: {
            $in: [
              RideStatus.DRIVER_FOUND,
              RideStatus.DRIVER_ARRIVED,
              RideStatus.ONGOING,
            ],
          },
        })
        .populate('user')
        .populate('rideType');

      if (!ride) {
        return new ApiResponse(200, null, Msg.NO_ACTIVE_RIDES_FOUND);
      }

      return new ApiResponse(200, ride, Msg.RIDES_FETCHED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async userActiveRide(userId: string) {
    try {
      const user = await this.userModel.findOne({
        _id: userId,
      });

      // console.log(`user -------->`, user);
      if (!user) {
        return new ApiResponse(404, {}, Msg.USER_NOT_FOUND);
      }

      const ride = await this.rideModel
        .findOne({
          user: user._id,
          status: {
            $in: [
              RideStatus.SEARCHING_DRIVER,
              RideStatus.DRIVER_FOUND,
              RideStatus.DRIVER_ARRIVED,
              RideStatus.ONGOING,
            ],
          },
        })
        .populate('user')
        .populate({
          path: 'driver',
          populate: {
            path: 'user',
            select: 'firstName lastName email avatar phoneNumber countryCode',
          },
        })
        .populate('rideType')
        .lean();

      console.log('user active ride', ride);

      if (!ride) {
        return new ApiResponse(200, null, Msg.NO_ACTIVE_RIDES_FOUND);
      }

      const baseUrl = process.env.BASE_URL;

      if (ride.user) {
        const u = ride.user as any;
        if (u.avatar) {
          u.avatar = `${baseUrl}/api/v1/uploads/profile/${u.avatar}`;
        } else {
          u.avatar = process.env.DEFAULT_IMAGE;
        }
      }

      if (ride.driver) {
        const d = ride.driver as any;

        if (d.user) {
          d.user.avatar = `${baseUrl}/api/v1/uploads/profile/${d.user.avatar}`;
        } else {
          d.user.avatar = process.env.DEFAULT_IMAGE;
        }

        const formatUrl = (fileName?: string) =>
          fileName && !fileName.startsWith('http')
            ? `${baseUrl}/api/v1/uploads/driver/${fileName}`
            : fileName;

        d.nationalIdFront = formatUrl(d.nationalIdFront);
        d.nationalIdBack = formatUrl(d.nationalIdBack);
        d.driverLicenseFront = formatUrl(d.driverLicenseFront);
        d.driverLicenseBack = formatUrl(d.driverLicenseBack);
        d.vehicleRegistrationFront = formatUrl(d.vehicleRegistrationFront);
        d.vehicleRegistrationBack = formatUrl(d.vehicleRegistrationBack);

        if (d.vehiclePhotos && Array.isArray(d.vehiclePhotos)) {
          d.vehiclePhotos = d.vehiclePhotos.map((photo: string) =>
            formatUrl(photo),
          );
        }
      }

      return new ApiResponse(200, ride, Msg.RIDES_FETCHED);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async userRideHistory(userId: string) {
    try {
      const user = await this.userModel.findOne({
        _id: userId,
      });
      if (!user) {
        return new ApiResponse(404, {}, Msg.USER_NOT_FOUND);
      }

      const rides = await this.rideModel
        .find({
          user: user._id,
          status: {
            $in: [RideStatus.COMPLETED, RideStatus.CANCELLED],
          },
        })
        .populate('user')
        .populate({
          path: 'driver',
          populate: {
            path: 'user',
            select: 'firstName lastName email avatar phoneNumber countryCode',
          },
        })
        .populate('rideType')
        .lean();

      if (!rides || rides.length === 0) {
        return new ApiResponse(200, [], Msg.RIDES_NOT_FOUND);
      }

      const baseUrl = process.env.BASE_URL;

      const formattedRides = rides.map((ride: any) => {
        const u = ride.user as any;
        if (ride.user) {
          u.avatar = `${baseUrl}/api/v1/uploads/profile/${u.avatar}`;
        } else {
          u.avatar = process.env.DEFAULT_IMAGE;
        }

        if (ride.driver) {
          const d = ride.driver as any;

          if (d.user) {
            d.user.avatar = `${baseUrl}/api/v1/uploads/profile/${d.user.avatar}`;
          } else {
            d.user.avatar = process.env.DEFAULT_IMAGE;
          }

          const formatUrl = (fileName?: string) =>
            fileName && !fileName.startsWith('http')
              ? `${baseUrl}/api/v1/uploads/driver/${fileName}`
              : fileName;

          d.nationalIdFront = formatUrl(d.nationalIdFront);
          d.nationalIdBack = formatUrl(d.nationalIdBack);
          d.driverLicenseFront = formatUrl(d.driverLicenseFront);
          d.driverLicenseBack = formatUrl(d.driverLicenseBack);
          d.vehicleRegistrationFront = formatUrl(d.vehicleRegistrationFront);
          d.vehicleRegistrationBack = formatUrl(d.vehicleRegistrationBack);

          if (d.vehiclePhotos && Array.isArray(d.vehiclePhotos)) {
            d.vehiclePhotos = d.vehiclePhotos.map((photo: string) =>
              formatUrl(photo),
            );
          }
        }

        return ride;
      });

      return new ApiResponse(200, formattedRides, Msg.RIDES_FETCHED);
    } catch (error) {
      console.log(`error while fetching user ride history`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async driverRideHistory(userId: string) {
    try {
      const driverDoc = await this.driverModel.findOne({
        user: userId,
      });
      if (!driverDoc) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const rides = await this.rideModel
        .find({
          driver: driverDoc._id,
          status: {
            $in: [RideStatus.COMPLETED, RideStatus.CANCELLED],
          },
        })
        .populate('user')
        .populate({
          path: 'driver',
          populate: {
            path: 'user',
            select: 'firstName lastName email avatar phoneNumber countryCode',
          },
        })
        .populate('rideType')
        .lean();

      if (!rides || rides.length === 0) {
        return new ApiResponse(200, [], Msg.RIDES_NOT_FOUND);
      }

      const baseUrl = process.env.BASE_URL;

      const formattedRides = rides.map((ride: any) => {
        const u = ride.user as any;
        if (u) {
          if (u.avatar && !u.avatar.startsWith('http')) {
            u.avatar = `${baseUrl}/api/v1/uploads/profile/${u.avatar}`;
          } else if (!u.avatar) {
            u.avatar = process.env.DEFAULT_IMAGE;
          }
        }

        if (ride.driver) {
          const d = ride.driver as any;

          if (d.user) {
            if (d.user.avatar && !d.user.avatar.startsWith('http')) {
              d.user.avatar = `${baseUrl}/api/v1/uploads/profile/${d.user.avatar}`;
            } else if (!d.user.avatar) {
              d.user.avatar = process.env.DEFAULT_IMAGE;
            }
          }

          const formatUrl = (fileName?: string) =>
            fileName && !fileName.startsWith('http')
              ? `${baseUrl}/api/v1/uploads/driver/${fileName}`
              : fileName;

          d.nationalIdFront = formatUrl(d.nationalIdFront);
          d.nationalIdBack = formatUrl(d.nationalIdBack);
          d.driverLicenseFront = formatUrl(d.driverLicenseFront);
          d.driverLicenseBack = formatUrl(d.driverLicenseBack);
          d.vehicleRegistrationFront = formatUrl(d.vehicleRegistrationFront);
          d.vehicleRegistrationBack = formatUrl(d.vehicleRegistrationBack);

          if (d.vehiclePhotos && Array.isArray(d.vehiclePhotos)) {
            d.vehiclePhotos = d.vehiclePhotos.map((photo: string) =>
              formatUrl(photo),
            );
          }
        }

        return ride;
      });

      return new ApiResponse(200, formattedRides, Msg.RIDES_FETCHED);
    } catch (error) {
      console.log(`error while fetching driver ride history`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async driverArrived(userId: string, rideId: string) {
    try {
    } catch (error) {
      console.log(`error while driver arrived`, error);
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async updateRideStatus(userId: string, dto: UpdateRideStatusDto) {
    try {
      const driver = await this.driverModel.findOne({ user: userId });

      if (!driver) {
        return new ApiResponse(404, {}, Msg.DRIVER_NOT_FOUND);
      }

      const ride = await this.rideModel.findById(dto.rideId).populate({
        path: 'rideType',
        select:
          'title baseFare perKmCharge perMinuteCharge minimumFare seats image',
      });

      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (ride?.driver?.toString() !== driver._id.toString()) {
        return new ApiResponse(400, {}, Msg.RIDE_NOT_ASSIGNED_TO_DRIVER);
      }

      let socketEvent = '';

      switch (dto.status) {
        case RideStatus.DRIVER_ARRIVED:
          if (ride.status !== RideStatus.DRIVER_FOUND) {
            return new ApiResponse(
              400,
              {},
              Msg.DRIVER_CAN_ONLY_ARRIVE_AFTER_ACCEPTING_THE_RIDE,
            );
          }

          socketEvent = 'driverArrived';
          break;

        case RideStatus.ONGOING:
          if (ride.status !== RideStatus.DRIVER_ARRIVED) {
            return new ApiResponse(
              400,
              {},
              Msg.RIDE_CAN_ONLY_START_AFTER_DRIVER_ARRIVES,
            );
          }

          socketEvent = 'rideStarted';
          break;

        case RideStatus.PAYMENT_PENDING:
          if (ride.status !== RideStatus.ONGOING) {
            return new ApiResponse(
              400,
              {},
              Msg.RIDE_MUST_BE_ONGOING_BEFORE_REQUESTING_PAYMENT,
            );
          }

          socketEvent = 'paymentPending';
          break;

        case RideStatus.COMPLETED:
          if (ride.status !== RideStatus.PAYMENT_PENDING) {
            return new ApiResponse(
              400,
              {},
              Msg.RIDE_COMPLETION_HANDLED_AFTER_SUCCESSFUL_PAYMENT,
            );
          }

          socketEvent = 'paymentCompleted';

          break;

        default:
          return new ApiResponse(400, {}, Msg.INVALID_RIDE_STATUS);
      }

      ride.status = dto.status;

      await ride.save();

      if (dto.status === RideStatus.PAYMENT_PENDING) {
        const rideType = ride.rideType as any;

        const fare = {
          baseFare: rideType?.baseFare,
          distanceCharge: rideType?.perKmCharge * ride.distance,
          timeCharge: rideType?.perMinuteCharge * ride.estimatedTime,
          total: ride.estimatedFare,
          currency: 'EUR',
        };

        const summary = {
          rideId: ride._id,
          status: ride.status,

          pickupAddress: ride.pickupAddress,
          destinationAddress: ride.destinationAddress,

          distance: ride.distance,
          duration: ride.estimatedTime,

          fare,

          rideType: {
            title: rideType?.title,
          },
        };

        this.socketService.emitToUser(
          ride.user.toString(),
          socketEvent,
          summary,
        );
        this.socketService.emitToUser(
          driver.user.toString(),
          socketEvent,
          summary,
        );
      } else {
        this.socketService.emitToUser(ride.user.toString(), socketEvent, {
          rideId: ride._id,
          status: ride.status,
        });
      }

      return new ApiResponse(200, {}, Msg.RIDE_STATUS_UPDATED_SUCCESSFULLY);
    } catch (error) {
      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async counterFare(userId: string, dto: CounterFareDto) {
    try {
      const ride = await this.rideModel.findById(dto.rideId);

      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (!ride.negotiatingDriver) {
        return new ApiResponse(400, {}, Msg.DRIVER_NOT_AVAILABLE);
      }

      if (
        ![RideStatus.SEARCHING_DRIVER, RideStatus.FARE_NEGOTIATION].includes(
          ride.status,
        )
      ) {
        return new ApiResponse(400, {}, Msg.INVALID_RIDE_STATUS);
      }

      const isPassenger = ride.user.toString() === userId;

      const driver = await this.driverModel.findOne({
        user: userId,
      });

      const isDriver =
        driver && ride.negotiatingDriver.toString() === driver._id.toString();

      if (!isPassenger && !isDriver) {
        return new ApiResponse(401, {}, Msg.UNAUTHORIZED);
      }

      if (isPassenger && ride.lastCounterBy === CounterBy.USER) {
        return new ApiResponse(400, {}, Msg.WAIT_FOR_DRIVER_RESPONSE);
      }

      if (isDriver && ride.lastCounterBy === CounterBy.DRIVER) {
        return new ApiResponse(400, {}, Msg.WAIT_FOR_USER_RESPONSE);
      }

      if (ride.negotiationRound >= 3) {
        await this.moveToNextDriver(ride);

        return new ApiResponse(400, {}, Msg.NEGOTIATION_LIMIT_REACHED);
      }

      ride.currentFare = dto.fare;

      ride.negotiationRound += 1;

      ride.lastCounterBy = isPassenger ? CounterBy.USER : CounterBy.DRIVER;

      ride.status = RideStatus.FARE_NEGOTIATION;

      ride.fareHistory.push({
        fare: dto.fare,
        offeredBy: ride.lastCounterBy,
        createdAt: new Date(),
      });

      await ride.save();

      const receiverId = isPassenger
        ? (await this.driverModel.findById(ride.negotiatingDriver))?.user.toString()
        : ride.user.toString();

      this.socketService.emitToUser(receiverId, 'fareCounterReceived', {
        rideId: ride._id,
        currentFare: ride.currentFare,
        negotiationRound: ride.negotiationRound,
        lastCounterBy: ride.lastCounterBy,
      });

      return new ApiResponse(200, ride, Msg.FARE_COUNTER_SENT);
    } catch (error) {
      console.log('counterFare error', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async acceptCounterFare(userId: string, dto: AcceptRideDto) {
    try {
      const ride = await this.rideModel.findById(dto.rideId);

      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (ride.status !== RideStatus.FARE_NEGOTIATION) {
        return new ApiResponse(400, {}, Msg.INVALID_RIDE_STATUS);
      }

      if (!ride.negotiatingDriver) {
        return new ApiResponse(400, {}, Msg.DRIVER_NOT_AVAILABLE);
      }

      const isPassenger = ride.user.toString() === userId;
      let isDriver = false;

      const driver = await this.driverModel.findOne({
        user: userId,
      });

      if (driver) {
        isDriver = driver._id.toString() === ride.negotiatingDriver.toString();
      }

      if (!isPassenger && !isDriver) {
        return new ApiResponse(401, {}, Msg.UNAUTHORIZED);
      }

      ride.driver = ride.negotiatingDriver;

      ride.negotiatingDriver = undefined;

      ride.status = RideStatus.DRIVER_FOUND;

      await ride.save();

      const rideData = await this.rideModel
        .findById(ride._id)
        .populate({
          path: 'driver',
          populate: {
            path: 'user',
            select: 'firstName lastName email avatar phoneNumber countryCode',
          },
        })
        .populate('rideType')
        .lean();

      const assignedDriver = await this.driverModel
        .findById(ride.driver)
        .populate('user');

      this.socketService.emitToUser(
        assignedDriver?.user['_id'].toString(),
        'fareAccepted',
        rideData,
      );

      this.socketService.emitToUser(
        ride.user.toString(),
        'driverFound',
        rideData,
      );

      return new ApiResponse(200, rideData, Msg.RIDE_ACCEPTED);
    } catch (error) {
      console.log('acceptCounterFare', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async rejectCounterFare(userId: string, dto: AcceptRideDto) {
    try {
      const ride = await this.rideModel.findById(dto.rideId);

      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (ride.status !== RideStatus.FARE_NEGOTIATION) {
        return new ApiResponse(400, {}, Msg.INVALID_RIDE_STATUS);
      }

      const isPassenger = ride.user.toString() === userId;

      let isDriver = false;

      if (ride.negotiatingDriver) {
        const driver = await this.driverModel.findOne({
          user: userId,
        });

        isDriver =
          !!driver &&
          driver._id.toString() === ride.negotiatingDriver.toString();
      }

      if (!isPassenger && !isDriver) {
        return new ApiResponse(401, {}, Msg.UNAUTHORIZED);
      }

      if (isPassenger) {
        const driver = await this.driverModel.findById(ride.negotiatingDriver);
        if (driver) {
          this.socketService.emitToUser(
            driver.user.toString(),
            'fareRejected',
            { rideId: ride._id }
          );
        }
      } else {
        this.socketService.emitToUser(
          ride.user.toString(),
          'fareRejected',
          { rideId: ride._id }
        );
      }

      await this.moveToNextDriver(ride);

      return new ApiResponse(200, {}, Msg.COUNTER_FARE_REJECTED);
    } catch (error) {
      console.log('rejectCounterFare', error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

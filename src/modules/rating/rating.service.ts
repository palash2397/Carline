import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Rating, RatingDocument } from './schema/rating.schema';
import { Ride, RideDocument } from '../ride/schema/ride.schema';
import { User, UserDocument } from '../user/schema/user.schema';
import { Driver, DriverDocument } from '../driver/schema/driver.schema';

// import { UserRole } from 'src/common/enums/user/role.enum';
import { RideStatus } from 'src/common/enums/ride/ride-enum';

import { ApiResponse } from 'src/helpers/ApiResponse';
import { Msg } from 'src/helpers/responseMsg';

import { CreateRatingDto } from './dto/create-rating.dto';
import { RatingFor } from 'src/common/enums/driver/rating-enum';

@Injectable()
export class RatingService {
  constructor(
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<RatingDocument>,

    @InjectModel(Ride.name)
    private readonly rideModel: Model<RideDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(Driver.name)
    private readonly driverModel: Model<DriverDocument>,
  ) {}

  async createRating(userId: string, dto: CreateRatingDto) {
    try {
      const ride = await this.rideModel.findById(dto.rideId).populate('driver');

      if (!ride) {
        return new ApiResponse(404, {}, Msg.RIDE_NOT_FOUND);
      }

      if (ride.status !== RideStatus.COMPLETED) {
        return new ApiResponse(400, {}, Msg.RIDE_NOT_COMPLETED);
      }

      const isPassenger = ride.user.toString() === userId;
      const isDriver =
        ride.driver && (ride.driver as any).user.toString() === userId;

      if (!isPassenger && !isDriver) {
        return new ApiResponse(401, {}, Msg.UNAUTHORIZED);
      }

      let givenTo: string | undefined;
      let ratingFor: RatingFor;

      if (isPassenger) {
        givenTo = (ride.driver as any).user.toString();
        ratingFor = RatingFor.DRIVER;
      } else {
        givenTo = ride.user.toString();
        ratingFor = RatingFor.USER;
      }

      const alreadyRated = await this.ratingModel.findOne({
        ride: ride._id,
        givenBy: userId,
      });

      if (alreadyRated) {
        return new ApiResponse(400, {}, Msg.RATING_ALREADY_SUBMITTED);
      }

      const rating = await this.ratingModel.create({
        ride: ride._id,
        givenBy: userId,
        givenTo,
        ratingFor,
        rating: dto.rating,
        review: dto.review,
      });

      //   await this.updateAverageRating(givenTo);

      return new ApiResponse(201, rating, Msg.RATING_SUBMITTED);
    } catch (error) {
      console.log(error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }

  async myReviews(userId: string) {
    try {
      const driver = await this.driverModel.findOne({ user: userId });
      const givenToIds = [userId];

      if (driver) {
        givenToIds.push(driver._id.toString());
      }

      let reviews = (await this.ratingModel
        .find({
          givenTo: { $in: givenToIds },
        })
        .populate('givenBy', 'firstName lastName avatar')
        .populate('ride', 'createdAt')
        .sort({
          createdAt: -1,
        })
        .lean()) as any[];

      if (!reviews || reviews.length === 0) {
        return new ApiResponse(404, {}, Msg.RATING_NOT_FOUND);
      }

      const baseUrl = process.env.BASE_URL;
      reviews = reviews.map((review) => {
        if (review.givenBy) {
          if (
            review.givenBy.avatar &&
            !review.givenBy.avatar.startsWith('http')
          ) {
            review.givenBy.avatar = `${baseUrl}/api/v1/uploads/profile/${review.givenBy.avatar}`;
          } else if (!review.givenBy.avatar) {
            review.givenBy.avatar = process.env.DEFAULT_IMAGE;
          }
        }
        return review;
      });

      return new ApiResponse(200, reviews, Msg.REVIEWS_FETCHED);
    } catch (error) {
      console.log(error);

      return new ApiResponse(500, {}, Msg.SERVER_ERROR);
    }
  }
}

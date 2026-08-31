import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Ride } from '../src/modules/ride/schema/ride.schema';
import { Model } from 'mongoose';
import * as fs from 'fs';
const csv = require('csv-parser');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const rideModel = app.get<Model<Ride>>(getModelToken(Ride.name));

  const results: any[] = [];
  const csvFilePath = path.join(__dirname, '../admin-calling-data-list-by-payment-date2026-08-27.csv');

  console.log('Reading CSV from:', csvFilePath);

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      const parsedId = Number(data['#'] || data[' #'] || data['\ufeff#'] || 0);
      results.push({
        rideId: isNaN(parsedId) ? 0 : parsedId,
        customerNumber: data['Customer Number'],
        customerSelectOption: data['Customer Select Option'],
        queueName: data['Queue Name'],
        driverNumber: data['Driver Number'],
        driverName: data['Driver Name'],
        driverSelectOption: data['Driver Select Option'],
        callDuration: data['Call Duration'],
        payment: data['Payment'],
        tripNumber: data['Trip Number'],
        rideAmount: parseFloat(data['Ride Amount ($)'] || '0'),
        paymentType: data['Payment Type'],
        paymentStatus: data['Payment Status'],
        driverAwayMinutes: data['Driver Away Minutes'],
        rideStatus: data['Ride Status'],
        rideNotes: data['Ride notes'],
        rideCompletedBy: data['Ride Completed By'],
        rideStartDateTime: data['Ride Start Date Time'],
        ridePaymentDateTime: data['Ride Payment Date Time'],
        rideCompleteDateTime: data['Ride Complete Date Time'],
      });
    })
    .on('end', async () => {
      console.log(`Parsed ${results.length} rides from CSV.`);
      try {
        try {
          await rideModel.collection.drop();
        } catch (e) {
          // Ignore if collection doesn't exist
        }
        await rideModel.insertMany(results);
        console.log('Successfully seeded database with rides.');
      } catch (error) {
        console.error('Error seeding database:', error);
      } finally {
        await app.close();
      }
    });
}

bootstrap();

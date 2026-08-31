import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Driver } from '../src/modules/driver/schema/driver.schema';
import { Model } from 'mongoose';
import * as fs from 'fs';
const csv = require('csv-parser');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const driverModel = app.get<Model<Driver>>(getModelToken(Driver.name));

  const results: any[] = [];
  const csvFilePath = path.join(__dirname, '../driver-data-2026-08-26 1.csv');

  console.log('Reading CSV from:', csvFilePath);

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      const parsedId = Number(data['#'] || data[' #'] || data['\ufeff#'] || 0);
      results.push({
        driverId: isNaN(parsedId) ? 0 : parsedId,
        driverName: data['Driver Name'],
        mobileNumber: data['Mobile Number'],
        email: data['Email'],
        address: data['Address'],
        vehicleNumber: data['Vehicle Number'],
        licenceNumber: data['Licence Number'],
        countryCode: data['Country Code'],
        makeModel: data['Make Model'],
        color: data['Color'],
        alternateNumber: data['Alternate Number'],
        status: data['Status'],
        assignQueue: data['Assign Queue'],
        loginLogout: data['Login & logout'],
        admOption: data['ADM Option'],
        priority: data['Priority'],
        loginTime: data['Login time'],
        logoutTime: data['Logout time'],
        queueTimeStatus: data['Queue Time Status'],
      });
    })
    .on('end', async () => {
      console.log(`Parsed ${results.length} drivers from CSV.`);
      try {
        try {
          await driverModel.collection.drop();
        } catch (e) {
          // Ignore if collection doesn't exist
        }
        await driverModel.insertMany(results);
        console.log('Successfully seeded database with drivers.');
      } catch (error) {
        console.error('Error seeding database:', error);
      } finally {
        await app.close();
      }
    });
}

bootstrap();

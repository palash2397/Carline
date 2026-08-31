import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Customer } from '../src/modules/customer/schema/customer.schema';
import { Model } from 'mongoose';
import * as fs from 'fs';
const csv = require('csv-parser');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const customerModel = app.get<Model<Customer>>(getModelToken(Customer.name));

  const results: any[] = [];
  const csvFilePath = path.join(__dirname, '../manage-customer-data-2026-08-27.csv');

  console.log('Reading CSV from:', csvFilePath);

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      const parsedId = Number(data['#'] || data[' #'] || data['\ufeff#'] || 0);
      results.push({
        customerId: isNaN(parsedId) ? 0 : parsedId,
        fullName: data['Full Name'],
        email: data['Email'],
        fullAddress: data['Full Address'],
        autoEmail: data['Auto Email'],
        accountNumber: data['Account Number'],
        mobileNumber: data['Mobile #'],
        credit: parseFloat(data['Credit'] || '0'),
        createdBy: data['Created By'],
        createdOn: data['Created On'],
        totalTripsTaken: data['Total Trips Taken'],
        totalTripsDropped: data['Total Trips Dropped'],
      });
    })
    .on('end', async () => {
      console.log(`Parsed ${results.length} customers from CSV.`);
      try {
        try {
          await customerModel.collection.drop();
        } catch (e) {
          // Ignore if collection doesn't exist
        }
        await customerModel.insertMany(results);
        console.log('Successfully seeded database with customers.');
      } catch (error) {
        console.error('Error seeding database:', error);
      } finally {
        await app.close();
      }
    });
}

bootstrap();

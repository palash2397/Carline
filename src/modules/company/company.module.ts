import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompanyService } from './company.service';
import { Company, CompanySchema } from './schema/company.schema';
import { CompanyCar, CompanyCarSchema } from './schema/company-car.schema';
import { CompanyController } from './company.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyCar.name, schema: CompanyCarSchema },
    ]),
  ],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [
    MongooseModule.forFeature([{ name: Company.name, schema: CompanySchema }]),
    MongooseModule.forFeature([
      { name: CompanyCar.name, schema: CompanyCarSchema },
    ]),
    CompanyService,
  ],
})
export class CompanyModule {}

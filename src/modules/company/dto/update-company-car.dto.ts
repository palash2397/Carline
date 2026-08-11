import { PartialType, ApiProperty } from '@nestjs/swagger';
import { AddCompanyCarDto } from './add-company-car.dto';
import { IsMongoId, IsString } from 'class-validator';

export class UpdateCompanyCarDto extends PartialType(AddCompanyCarDto) {
  @ApiProperty({ description: 'The ID of the car to update' })
  @IsMongoId()
  carId: string;
}

import { IsOptional, IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from 'src/common/enums/user/role.enum';

export class SendOtpDto {
  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
  @IsNotEmpty()
  @IsEnum(UserRole, { message: 'Invalid role provided' })
  roles: UserRole;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  countryCode?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

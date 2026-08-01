import { IsString, IsUUID } from 'class-validator';

export class AssociateSensorDto {
  @IsString()
  deviceId: string;

  @IsUUID()
  parcelId: string;
}
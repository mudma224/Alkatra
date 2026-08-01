import { IsString, IsNumber, Min, IsOptional, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GeoJsonPointDto {
  @IsString()
  type: 'Point';

  @IsNumber({}, { each: true })
  coordinates: [number, number];
}

export class CreateFarmDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsNumber()
  @Min(0.01)
  totalAreaHa: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoJsonPointDto)
  location?: GeoJsonPointDto;
}
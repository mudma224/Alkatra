import { IsString, IsNumber, Min, IsOptional, IsEnum, MaxLength, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

class GeoJsonPointDto {
  @IsString()
  type: 'Point';

  @IsNumber({}, { each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  coordinates: [number, number];
}

class GeoJsonPolygonDto {
  @IsString()
  type: 'Polygon';

  @ValidateNested({ each: true })
  @Type(() => Object)
  coordinates: number[][][];
}

export class UpdateParcelDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  areaHa?: number;

  @IsOptional()
  @IsEnum(['olive', 'citrus', 'cereal', 'vegetable', 'other'])
  cropType?: string;

  @IsOptional()
  @IsEnum(['clay', 'silt', 'sandy', 'calcareous', 'mixed'])
  soilType?: string;

  @IsOptional()
  @IsEnum(['drip', 'sprinkler', 'gravity'])
  irrigationMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cropVariety?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  flowRateM3h?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  treeAgeYears?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  treeDensityPerHa?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoJsonPointDto)
  centroid?: GeoJsonPointDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoJsonPolygonDto)
  polygon?: GeoJsonPolygonDto;
}
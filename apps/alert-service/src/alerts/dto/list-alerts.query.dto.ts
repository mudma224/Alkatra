import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ALERT_STATUSES, type AlertStatusValue } from '../../database/entities/alert.entity';

export class ListAlertsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @IsOptional()
  @IsEnum(ALERT_STATUSES)
  @IsString()
  status?: AlertStatusValue;

  /** Raccourci équivalent à status=unread (badge « non lues »). */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

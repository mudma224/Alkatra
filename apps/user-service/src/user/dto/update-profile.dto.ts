// apps/user-service/src/user/dto/update-profile.dto.ts

import { IsOptional, IsString, IsIn, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(['french', 'arabic', 'darija'])
  preferredLanguage?: 'french' | 'arabic' | 'darija';
}

import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire' })
  @Matches(/^\+212[67]\d{8}$/, {
    message: 'Le numéro de téléphone doit être un numéro marocain valide',
  })
  phone: string;

  @IsString({ message: 'Le refresh token doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le refresh token est obligatoire' })
  refreshToken: string;
}
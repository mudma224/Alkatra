import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire' })
  @Matches(/^\+212[67]\d{8}$/, {
    message: 'Le numéro de téléphone doit être un numéro marocain valide',
  })
  phone: string;

  @IsString({ message: 'Le code OTP doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le code OTP est obligatoire' })
  @Matches(/^\d{6}$/, { message: 'Le code OTP doit contenir exactement 6 chiffres' })
  otp: string;
}
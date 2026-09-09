import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from '../otp/dto/verify-otp.dto';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: RegisterDto) {
    const { expiresAt } = await this.authService.requestOtp(dto.phone);
    return {
      success: true,
      message: 'OTP envoyé',
      expiresAt: expiresAt.toISOString(),
    };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtpAndAuthenticate(dto.phone, dto.otp);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: LoginDto) {
    // Alias fonctionnel de /login — même contrat, exposé pour compatibilité
    // avec l'interceptor Axios du frontend (Sprint 4).
    return this.authService.refreshSession(dto.phone, dto.refreshToken);
  }
}
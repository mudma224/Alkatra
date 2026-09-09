// apps/user-service/src/user/user.controller.ts

import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
    phone: string;
  };
};

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.userService.getProfile(req.user.userId);
  }

  @Patch('profile')
  updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user.userId, dto);
  }
}

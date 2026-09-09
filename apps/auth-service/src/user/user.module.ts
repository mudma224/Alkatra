import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { InternalUserController } from './internal-user.controller';
import { InternalUserService } from './internal-user.service';
import { UserEntity } from '../auth/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [UserController, InternalUserController],
  providers: [UserService, InternalUserService],
  exports: [UserService, InternalUserService],
})
export class UserModule {}

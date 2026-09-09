import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';

@Injectable()
export class InternalUserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, data: { name?: string | null; preferredLanguage?: 'french' | 'arabic' | 'darija' }) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (data.name !== undefined) user.name = data.name;
    if (data.preferredLanguage !== undefined) user.preferredLanguage = data.preferredLanguage;

    await this.userRepository.save(user);
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt,
    };
  }
}
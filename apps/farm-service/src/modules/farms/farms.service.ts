import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Farm } from '../../database/entities/farm.entity';
import { Parcel } from '../../database/entities/parcel.entity';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { AuthClientService } from '../../auth/auth-client.service';

@Injectable()
export class FarmsService {
  private readonly logger = new Logger(FarmsService.name);

  constructor(
    @InjectRepository(Farm)
    private farmsRepository: Repository<Farm>,
    @InjectRepository(Parcel)
    private parcelsRepository: Repository<Parcel>,
    private authClient: AuthClientService
  ) {}

  async create(createFarmDto: CreateFarmDto, userId: string): Promise<Farm> {
    this.logger.log(`Tentative de création de ferme pour l'utilisateur ${userId}`);

    const userExists = await this.authClient.verifyUserExists(userId);
    if (!userExists) {
      throw new HttpException('Aucun utilisateur trouvé pour cet ID. Création de ferme bloquée.', HttpStatus.NOT_FOUND);
    }

    const newFarm = this.farmsRepository.create({
      ...createFarmDto,
      ownerId: userId,
    });
    return this.farmsRepository.save(newFarm);
  }

  async findAllByOwner(ownerId: string): Promise<Farm[]> {
    return this.farmsRepository.find({ where: { ownerId }, relations: { parcels: true } });
  }

  async findOne(id: string, ownerId: string): Promise<Farm> {
    const farm = await this.farmsRepository.findOne({ where: { id }, relations: { parcels: true } });
    if (!farm) {
      throw new HttpException('Ferme introuvable dans la base de données.', HttpStatus.NOT_FOUND);
    }
    if (farm.ownerId !== ownerId) {
      throw new HttpException('Accès refusé : cette ferme n\'appartient pas à l\'utilisateur connecté.', HttpStatus.FORBIDDEN);
    }
    return farm;
  }

  async update(id: string, updateFarmDto: UpdateFarmDto, ownerId: string): Promise<Farm> {
    const farm = await this.findOne(id, ownerId);
    Object.assign(farm, updateFarmDto);
    return this.farmsRepository.save(farm);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const farm = await this.findOne(id, ownerId);

    // Vérifier si la ferme a des parcelles avant suppression
    const parcelCount = await this.parcelsRepository.count({ where: { farmId: id } });
    if (parcelCount > 0) {
      throw new HttpException(
        `Suppression impossible : la ferme possède ${parcelCount} parcelle(s). Veuillez d'abord les supprimer.`,
        HttpStatus.CONFLICT
      );
    }

    this.logger.log(`Suppression de la ferme ${id}`);
    await this.farmsRepository.remove(farm);
  }
}
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parcel } from '../../database/entities/parcel.entity';
import { Farm } from '../../database/entities/farm.entity';
import { CreateParcelDto } from './dto/create-parcel.dto';
import { UpdateParcelDto } from './dto/update-parcel.dto';

@Injectable()
export class ParcelsService {
  private readonly logger = new Logger(ParcelsService.name);

  constructor(
    @InjectRepository(Parcel)
    private parcelsRepository: Repository<Parcel>,
    @InjectRepository(Farm)
    private farmsRepository: Repository<Farm>
  ) {}

  async create(createParcelDto: CreateParcelDto, userId: string): Promise<Parcel> {
    const { farmId, areaHa } = createParcelDto;

    // 1. Vérifier que la ferme appartient à l'utilisateur
    const farm = await this.farmsRepository.findOne({ where: { id: farmId, ownerId: userId } });
    if (!farm) {
      throw new HttpException('Ferme parente introuvable ou accès non autorisé à cette ferme.', HttpStatus.NOT_FOUND);
    }

    // 2. Vérifier la cohérence des surfaces
    const existingParcels = await this.parcelsRepository.find({ where: { farmId } });
    const totalParcelArea = existingParcels.reduce((sum, p) => sum + Number(p.areaHa), 0);
    if (totalParcelArea + Number(areaHa) > Number(farm.totalAreaHa)) {
      throw new HttpException(
        `La surface totale des parcelles (${totalParcelArea + Number(areaHa)} ha) dépasse la surface de la ferme (${farm.totalAreaHa} ha).`,
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    // 3. Créer la parcelle avec mapping explicite au lieu du double cast
    const newParcel = this.parcelsRepository.create({
      farmId,
      name: createParcelDto.name,
      areaHa: createParcelDto.areaHa,
      cropType: createParcelDto.cropType,
      soilType: createParcelDto.soilType,
      irrigationMethod: createParcelDto.irrigationMethod,
      cropVariety: createParcelDto.cropVariety,
      flowRateM3h: createParcelDto.flowRateM3h,
      treeAgeYears: createParcelDto.treeAgeYears,
      treeDensityPerHa: createParcelDto.treeDensityPerHa,
      centroid: createParcelDto.centroid,
      polygon: createParcelDto.polygon,
    });

    this.logger.log(`Création de la parcelle "${createParcelDto.name}" pour la ferme ${farmId}`);
    return this.parcelsRepository.save(newParcel);
  }

  async findAllByFarm(farmId: string, userId: string): Promise<Parcel[]> {
    const farm = await this.farmsRepository.findOne({ where: { id: farmId, ownerId: userId } });
    if (!farm) throw new HttpException('Ferme introuvable ou accès refusé.', HttpStatus.NOT_FOUND);
    return this.parcelsRepository.find({ where: { farmId }, relations: { sensors: true } });
  }

  async findOne(id: string, userId: string): Promise<Parcel> {
    const parcel = await this.parcelsRepository.findOne({ where: { id }, relations: { farm: true, sensors: true } });
    if (!parcel) throw new HttpException('Parcelle introuvable.', HttpStatus.NOT_FOUND);
    if (parcel.farm.ownerId !== userId) throw new HttpException('Accès refusé à cette parcelle.', HttpStatus.FORBIDDEN);
    return parcel;
  }

  /**
   * Résolution parcelle → propriétaire pour les services internes sans
   * contexte utilisateur (ex: alert-service sur le flux Kafka des
   * recommandations). 404 si la parcelle n'existe pas.
   */
  async findParcelOwner(parcelId: string): Promise<{ parcelId: string; farmId: string; ownerId: string }> {
    const parcel = await this.parcelsRepository.findOne({
      where: { id: parcelId },
      relations: { farm: true },
    });
    if (!parcel) throw new HttpException('Parcelle introuvable.', HttpStatus.NOT_FOUND);
    return { parcelId: parcel.id, farmId: parcel.farmId, ownerId: parcel.farm.ownerId };
  }

  async update(id: string, updateParcelDto: UpdateParcelDto, userId: string): Promise<Parcel> {
    const parcel = await this.findOne(id, userId);

    // Si areaHa change, vérifier la cohérence des surfaces
    if (updateParcelDto.areaHa !== undefined) {
      const existingParcels = await this.parcelsRepository.find({ where: { farmId: parcel.farmId } });
      const otherParcelsArea = existingParcels
        .filter(p => p.id !== id)
        .reduce((sum, p) => sum + Number(p.areaHa), 0);
      if (otherParcelsArea + Number(updateParcelDto.areaHa) > Number(parcel.farm.totalAreaHa)) {
        throw new HttpException(
          `La surface totale des parcelles dépasserait la surface de la ferme (${parcel.farm.totalAreaHa} ha).`,
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }
    }

    Object.assign(parcel, updateParcelDto);
    this.logger.log(`Mise à jour de la parcelle ${id}`);
    return this.parcelsRepository.save(parcel);
  }

  async remove(id: string, userId: string): Promise<void> {
    const parcel = await this.findOne(id, userId);
    this.logger.log(`Suppression de la parcelle ${id}`);
    await this.parcelsRepository.remove(parcel);
  }
}
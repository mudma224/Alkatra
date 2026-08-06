import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '../../database/entities/sensor.entity';
import { Parcel } from '../../database/entities/parcel.entity';
import { AssociateSensorDto } from './dto/associate-sensor.dto';

@Injectable()
export class SensorsService {
  private readonly logger = new Logger(SensorsService.name);

  constructor(
    @InjectRepository(Sensor)
    private sensorsRepository: Repository<Sensor>,
    @InjectRepository(Parcel)
    private parcelsRepository: Repository<Parcel>
  ) {}

  async associate(associateDto: AssociateSensorDto, userId: string): Promise<Sensor> {
    const { deviceId, parcelId } = associateDto;

    // 1. Vérifier que la parcelle appartient bien au user (via la relation Farm)
    const parcel = await this.parcelsRepository.findOne({ where: { id: parcelId }, relations: { farm: true } });
    if (!parcel) throw new HttpException('Parcelle introuvable pour association capteur.', HttpStatus.NOT_FOUND);
    if (parcel.farm.ownerId !== userId) throw new HttpException('Action interdite : la parcelle ne vous appartient pas.', HttpStatus.FORBIDDEN);

    // 2. Vérifier si le capteur physique (device_id) est déjà enregistré
    let sensor = await this.sensorsRepository.findOne({ where: { deviceId } });

    if (sensor) {
      // 3. Si le capteur existe déjà sur une autre parcelle, vérifier que l'ancienne parcelle appartient aussi à l'utilisateur
      if (sensor.parcelId !== parcelId) {
        const oldParcel = await this.parcelsRepository.findOne({ where: { id: sensor.parcelId }, relations: { farm: true } });
        if (oldParcel && oldParcel.farm.ownerId !== userId) {
          throw new HttpException(
            'Action interdite : le capteur appartient à une parcelle d\'un autre utilisateur.',
            HttpStatus.FORBIDDEN
          );
        }

        // Réassociation à la nouvelle parcelle
        sensor.parcelId = parcelId;
        sensor.isActive = true;
        this.logger.log(`Capteur ${deviceId} réassocié de la parcelle ${sensor.parcelId} vers ${parcelId}`);
      } else {
        // Capteur déjà sur la bonne parcelle — pas d'écriture DB inutile
        this.logger.log(`Capteur ${deviceId} déjà associé à la parcelle ${parcelId}, aucune modification nécessaire`);
        return sensor;
      }
    } else {
      // 4. S'il n'existe pas, on l'enregistre pour la 1ère fois
      sensor = this.sensorsRepository.create({
        deviceId: deviceId,
        parcelId: parcelId,
        deviceType: 'esp32-wroom-32', // Par défaut selon farm-db.sql
        isActive: true
      });
      this.logger.log(`Nouveau capteur ${deviceId} associé à la parcelle ${parcelId}`);
    }

    return this.sensorsRepository.save(sensor);
  }
}
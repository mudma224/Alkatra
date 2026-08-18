import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '../../database/entities/sensor.entity';
import { Parcel } from '../../database/entities/parcel.entity';
import { AssociateSensorDto } from './dto/associate-sensor.dto';
import { SensorHeartbeatDto } from './dto/sensor-heartbeat.dto';

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

  /**
   * Dissocie (supprime) un capteur de sa parcelle — choix validé : DELETE simple
   * de la ligne SQL. Les mesures MongoDB (clé device_id) sont conservées ;
   * réassocier le même device recrée la ligne. Garde anti-vol identique à
   * l'association : la parcelle porteuse doit appartenir à l'utilisateur.
   */
  async dissociate(sensorId: string, userId: string): Promise<void> {
    const sensor = await this.sensorsRepository.findOne({ where: { id: sensorId } });
    if (!sensor) throw new HttpException('Capteur introuvable.', HttpStatus.NOT_FOUND);

    const parcel = await this.parcelsRepository.findOne({
      where: { id: sensor.parcelId },
      relations: { farm: true },
    });
    if (!parcel || parcel.farm.ownerId !== userId) {
      throw new HttpException(
        'Action interdite : le capteur ne vous appartient pas.',
        HttpStatus.FORBIDDEN,
      );
    }

    this.logger.log(`Capteur ${sensor.deviceId} dissocié de la parcelle ${sensor.parcelId}`);
    await this.sensorsRepository.remove(sensor);
  }

  /**
   * Heartbeat interne (iot-service → PATCH /internal/sensors/:deviceId/seen) :
   * rafraîchit last_seen_at, réactive le capteur et met à jour batterie/firmware
   * si fournies. Le cron SensorActivityService le repassera inactif après 48 h
   * de silence.
   */
  async recordHeartbeat(deviceId: string, heartbeat: SensorHeartbeatDto): Promise<Sensor> {
    const sensor = await this.sensorsRepository.findOne({ where: { deviceId } });
    if (!sensor) throw new HttpException(`Capteur inconnu : ${deviceId}.`, HttpStatus.NOT_FOUND);

    sensor.lastSeenAt = new Date();
    sensor.isActive = true;
    if (heartbeat.batteryPct !== undefined) sensor.batteryPct = heartbeat.batteryPct;
    if (heartbeat.firmwareVersion !== undefined) sensor.firmwareVersion = heartbeat.firmwareVersion;

    this.logger.log(`Heartbeat reçu du capteur ${deviceId}`);
    return this.sensorsRepository.save(sensor);
  }

  /**
   * Liste les capteurs associés à une parcelle (vérifie la propriété via la ferme).
   */
  async findByParcel(parcelId: string, userId: string): Promise<Sensor[]> {
    const parcel = await this.parcelsRepository.findOne({ where: { id: parcelId }, relations: { farm: true } });
    if (!parcel) throw new HttpException('Parcelle introuvable.', HttpStatus.NOT_FOUND);
    if (parcel.farm.ownerId !== userId) throw new HttpException('Accès refusé à cette parcelle.', HttpStatus.FORBIDDEN);

    return this.sensorsRepository.find({ where: { parcelId } });
  }
}
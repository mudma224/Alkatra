import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PredictionEventDto } from '../dto/prediction-event.dto';
import { Recommendation } from '../entities/recommendation.entity';
import { ExplanationService } from '../explanation/explanation.service';

@Injectable()
export class DoubleWriteService {
  private readonly logger = new Logger(DoubleWriteService.name);

  constructor(
    @InjectRepository(Recommendation)
    private readonly repo: Repository<Recommendation>,
    private readonly explanationService: ExplanationService,
  ) {}

  /**
   * Projette un événement de prédiction (source : ml-inference-service)
   * vers la table relationnelle `recommendations`.
   *
   * MongoDB reste la source riche pour le ré-entraînement ;
   * PostgreSQL est la source de vérité applicative (API + feedback).
   */
  async persist(event: PredictionEventDto): Promise<Recommendation | null> {
    const confidenceScore = this.round(event.irrigation_probability, 3);
    const quantityMm = event.should_irrigate
      ? this.round(event.water_amount_mm, 2)
      : 0;

    const generatedAt = event.generated_at
      ? new Date(event.generated_at)
      : new Date();

    // Idempotence : vérifier si une ligne avec (parcel_id, generated_at) existe déjà
    const existing = await this.repo.findOne({
      where: { parcelId: event.parcel_id, generatedAt },
      select: ['id'],
    });

    if (existing) {
      this.logger.log(
        `Doublon ignoré — parcel=${event.parcel_id} generatedAt=${generatedAt.toISOString()}`,
      );
      return null;
    }

    const explanation = this.explanationService.build({
      irrigate: event.should_irrigate,
      quantityMm,
      confidenceScore,
      topFactors: event.top_factors ?? [],
    });

    const entity = this.repo.create({
      parcelId: event.parcel_id,
      generatedAt,
      irrigate: event.should_irrigate,
      confidenceScore,
      quantityMm,
      // Champs alimentés depuis le payload Kafka
      durationMinutes: event.duration_minutes ?? null,
      soilHumidityPctAtGen: event.soil_humidity_pct ?? null,
      etoAtGen: event.eto ?? null,
      reasonCode: explanation.reasonCode,
      shapFactors: event.top_factors ?? [],
      explanationTextFr: explanation.fr,
      explanationTextDarija: explanation.darija,
      modelVersion: event.model_version ?? null,
      status: 'pending',
      demoMode: event.demo_mode ?? false,
      // Note: water_amount_raw_mm et bias_applied_mm ne sont pas stockés dans PostgreSQL
      // car ils sont déjà persistés dans MongoDB (irrigation_recommendations).
    });

    const saved = await this.repo.save(entity);
    this.logger.log(
      `Recommandation persistée [${saved.id}] parcel=${saved.parcelId} irrigate=${saved.irrigate} qty=${saved.quantityMm}mm demo=${saved.demoMode}`,
    );
    return saved;
  }

  private round(value: number | undefined | null, digits: number): number | null {
    if (value === undefined || value === null || Number.isNaN(value)) return null;
    const f = 10 ** digits;
    return Math.round(value * f) / f;
  }
}
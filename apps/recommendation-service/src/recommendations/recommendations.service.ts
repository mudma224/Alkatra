import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { FeedbackDto } from '../dto/feedback.dto';
import { RecommendationResponseDto } from '../dto/recommendation-response.dto';
import {
  Recommendation,
  RecommendationStatus,
} from '../entities/recommendation.entity';

/** Transitions de statut autorisées pour le feedback */
const LOCKED_STATUSES: RecommendationStatus[] = ['executed', 'expired'];

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(Recommendation)
    private readonly repo: Repository<Recommendation>,
  ) {}

  /** Dernière recommandation du jour pour une parcelle */
  async findTodayByParcel(parcelId: string): Promise<RecommendationResponseDto> {
    const { start, end } = this.todayRange();

    const reco = await this.repo.findOne({
      where: { parcelId, generatedAt: Between(start, end) },
      order: { generatedAt: 'DESC' },
    });

    if (!reco) {
      throw new NotFoundException(
        `Aucune recommandation disponible aujourd'hui pour la parcelle ${parcelId}`,
      );
    }

    // Passage automatique pending → seen à la première consultation (update atomique)
    if (reco.status === 'pending') {
      await this.repo
        .createQueryBuilder()
        .update(Recommendation)
        .set({ status: 'seen' })
        .where('id = :id AND status = :status', {
          id: reco.id,
          status: 'pending',
        })
        .execute();
      reco.status = 'seen';
    }

    return this.toDto(reco);
  }

  /** Historique paginé */
  async findHistoryByParcel(
    parcelId: string,
    limit = 30,
    offset = 0,
  ): Promise<{ total: number; items: RecommendationResponseDto[] }> {
    const [rows, total] = await this.repo.findAndCount({
      where: { parcelId },
      order: { generatedAt: 'DESC' },
      take: Math.min(limit, 100),
      skip: offset,
    });

    return { total, items: rows.map((r) => this.toDto(r)) };
  }

  /** Feedback agriculteur (boucle d'amélioration du modèle) */
  async submitFeedback(
    id: string,
    dto: FeedbackDto,
  ): Promise<RecommendationResponseDto> {
    const reco = await this.repo.findOne({ where: { id } });
    if (!reco) throw new NotFoundException(`Recommandation ${id} introuvable`);

    // Vérifier que le statut n'est pas verrouillé
    if (LOCKED_STATUSES.includes(reco.status)) {
      throw new BadRequestException(
        `Recommandation verrouillée (statut: ${reco.status}) — feedback impossible`,
      );
    }

    reco.userFeedback = dto.feedback;
    reco.feedbackAt = new Date();
    reco.status = dto.feedback === 'ignored' ? 'expired' : dto.feedback;

    const saved = await this.repo.save(reco);
    return this.toDto(saved);
  }

  /** Marquer une recommandation comme exécutée (irrigation déclenchée) */
  async markAsExecuted(id: string): Promise<RecommendationResponseDto> {
    const reco = await this.repo.findOne({ where: { id } });
    if (!reco) throw new NotFoundException(`Recommandation ${id} introuvable`);

    if (reco.status !== 'accepted') {
      throw new BadRequestException(
        'Seule une recommandation acceptée peut être exécutée',
      );
    }

    reco.status = 'executed';
    const saved = await this.repo.save(reco);
    return this.toDto(saved);
  }

  /** Utilisé par le controller pour vérifier la propriété avant feedback/execute */
  async getParcelIdOf(id: string): Promise<string> {
    const reco = await this.repo.findOne({
      where: { id },
      select: ['id', 'parcelId'],
    });
    if (!reco) throw new NotFoundException(`Recommandation ${id} introuvable`);
    return reco.parcelId;
  }

  private todayRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private toDto(r: Recommendation): RecommendationResponseDto {
    return {
      id: r.id,
      parcelId: r.parcelId,
      generatedAt: r.generatedAt,
      irrigate: r.irrigate,
      confidenceScore: r.confidenceScore,
      quantityMm: r.quantityMm,
      durationMinutes: r.durationMinutes,
      reasonCode: r.reasonCode,
      topFactors: r.shapFactors ?? [],
      explanation: {
        fr: r.explanationTextFr ?? '',
        darija: r.explanationTextDarija ?? '',
      },
      modelVersion: r.modelVersion,
      status: r.status,
      userFeedback: r.userFeedback,
      demoMode: r.demoMode ?? false,
    };
  }
}
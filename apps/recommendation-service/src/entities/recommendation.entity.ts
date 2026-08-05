import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RecommendationStatus =
  | 'pending'
  | 'seen'
  | 'accepted'
  | 'rejected'
  | 'executed'
  | 'expired';

export type RecommendationFeedback = 'accepted' | 'rejected' | 'ignored';

export interface ShapFactor {
  feature: string;
  label_fr: string;
  label_ar: string;
  contribution: number;
}

@Entity('recommendations')
export class Recommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_recommendations_parcel_id')
  @Column({ name: 'parcel_id', type: 'uuid', nullable: false })
  parcelId: string;

  @Index('idx_recommendations_generated_at')
  @Column({
    name: 'generated_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'NOW()',
  })
  generatedAt: Date;

  @Index('idx_recommendations_irrigate')
  @Column({ name: 'irrigate', type: 'boolean', nullable: false })
  irrigate: boolean;

  @Column({
    name: 'confidence_score',
    type: 'decimal',
    precision: 4,
    scale: 3,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : parseFloat(v)),
    },
  })
  confidenceScore: number | null;

  @Column({
    name: 'quantity_mm',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : parseFloat(v)),
    },
  })
  quantityMm: number | null;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes: number | null;

  @Column({ name: 'reason_code', type: 'varchar', length: 50, nullable: true })
  reasonCode: string | null;

  @Column({ name: 'shap_factors', type: 'jsonb', nullable: true })
  shapFactors: ShapFactor[] | null;

  @Column({ name: 'explanation_text_fr', type: 'text', nullable: true })
  explanationTextFr: string | null;

  @Column({ name: 'explanation_text_darija', type: 'text', nullable: true })
  explanationTextDarija: string | null;

  @Column({
    name: 'soil_humidity_pct_at_gen',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : parseFloat(v)),
    },
  })
  soilHumidityPctAtGen: number | null;

  @Column({
    name: 'eto_at_gen',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : parseFloat(v)),
    },
  })
  etoAtGen: number | null;

  @Column({ name: 'model_version', type: 'varchar', length: 20, nullable: true })
  modelVersion: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['pending', 'seen', 'accepted', 'rejected', 'executed', 'expired'],
    enumName: 'recommendation_status_enum',
    default: 'pending',
  })
  status: RecommendationStatus;

  @Column({
    name: 'user_feedback',
    type: 'enum',
    enum: ['accepted', 'rejected', 'ignored'],
    enumName: 'recommendation_feedback_enum',
    nullable: true,
  })
  userFeedback: RecommendationFeedback | null;

  @Column({ name: 'feedback_at', type: 'timestamptz', nullable: true })
  feedbackAt: Date | null;

  @Column({
    name: 'demo_mode',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  demoMode: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
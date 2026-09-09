import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, Index, JoinColumn } from 'typeorm';
import { Farm } from './farm.entity';
import { Sensor } from './sensor.entity';
import { GeoJsonPoint, GeoJsonPolygon } from '../../common/types/geojson';

@Entity('parcels')
@Index(['farmId', 'name'], { unique: true })
export class Parcel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'farm_id' })
  farmId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'area_ha' })
  areaHa: number;

  @Column({ type: 'enum', enum: ['olive', 'citrus', 'cereal', 'vegetable', 'other'], name: 'crop_type' })
  cropType: string;

  @Column({ type: 'enum', enum: ['clay', 'silt', 'sandy', 'calcareous', 'mixed'], name: 'soil_type' })
  soilType: string;

  @Column({ type: 'enum', enum: ['drip', 'sprinkler', 'gravity'], name: 'irrigation_method' })
  irrigationMethod: string;

  @Column({ type: 'varchar', length: 100, name: 'crop_variety', nullable: true })
  cropVariety: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'flow_rate_m3h', nullable: true })
  flowRateM3h: number | null;

  @Column({ type: 'int', name: 'tree_age_years', nullable: true })
  treeAgeYears: number | null;

  @Column({ type: 'int', name: 'tree_density_per_ha', nullable: true })
  treeDensityPerHa: number | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: true,
  })
  polygon: GeoJsonPolygon | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  centroid: GeoJsonPoint | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => Farm, farm => farm.parcels, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @OneToMany(() => Sensor, sensor => sensor.parcel)
  sensors?: Sensor[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
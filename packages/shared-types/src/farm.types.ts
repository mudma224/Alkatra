/**
 * Al Katra Bel Qatra — Types Fermes & Parcelles
 * Compatible CdC Section 7.1
 */

export type CropType = 'olive' | 'citrus' | 'cereal' | 'vegetable' | 'other';
export type SoilType = 'clay' | 'silt' | 'sandy' | 'calcareous' | 'mixed';
export type IrrigationMethod = 'drip' | 'sprinkler' | 'gravity';
export type PhenologicalStage =
  | 'dormancy'
  | 'flowering'
  | 'fruit_development'
  | 'ripening'
  | 'harvest'
  | 'post_harvest';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Farm {
  id: string;
  user_id: string;
  name: string;
  region?: string;
  location?: GeoPoint;
  total_area_ha?: number;
  created_at: string;
  updated_at: string;
}

export interface Parcel {
  id: string;
  farm_id: string;
  name: string;
  area_ha: number;
  crop_type: CropType;
  crop_variety?: string;
  soil_type: SoilType;
  irrigation_method: IrrigationMethod;
  flow_rate_m3h?: number;
  tree_age_years?: number;
  tree_density_per_ha?: number;
  centroid?: GeoPoint;
  created_at: string;
  updated_at: string;
}

export interface IrrigationRecommendation {
  id: string;
  parcel_id: string;
  generated_at: string;
  irrigate: boolean;
  confidence_score?: number;
  quantity_mm?: number;
  duration_minutes?: number;
  reason_code?: string;
  shap_factors?: ShapFactor[];
  explanation_text_fr?: string;
  explanation_text_darija?: string;
  user_feedback?: 'accepted' | 'rejected' | 'ignored' | null;
}

export interface ShapFactor {
  feature_name: string;
  feature_value: number;
  shap_value: number;
  impact: 'positive' | 'negative';
  label_fr: string;
  label_darija: string;
}
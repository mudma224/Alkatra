"""Schémas Pydantic — Option 1 : /predict reçoit les 22 features."""
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field

# Ordre EXACT attendu par le modèle (identique à l'entraînement)
FEATURE_NAMES: List[str] = [
    "temp_max", "temp_min", "temp_moy", "delta_temp",
    "humidite_air", "vent", "rayonnement", "pluie",
    "ET0_mm", "ETc", "humidite_sol_avant_%", "humidite_sol_rolling3",
    "jour_annee", "mois", "jour_semaine",
    "humidite_sol_j-1", "pluie_j-1", "ETc_j-1", "pluie_3j",
    "eto_hum_ratio", "deficit_hydrique", "regime_sol",
]

class PredictionRequest(BaseModel):
    parcel_id: str = Field(..., examples=["parcel_test_001"])
    temp_max: float
    temp_min: float
    temp_moy: float
    delta_temp: float
    humidite_air: float
    vent: float
    rayonnement: float
    pluie: float
    ET0_mm: float
    ETc: float
    humidite_sol_avant_pct: float = Field(..., alias="humidite_sol_avant_%")
    humidite_sol_rolling3: float
    jour_annee: int
    mois: int
    jour_semaine: int
    humidite_sol_j1: float = Field(..., alias="humidite_sol_j-1")
    pluie_j1: float = Field(..., alias="pluie_j-1")
    ETc_j1: float = Field(..., alias="ETc_j-1")
    pluie_3j: float
    eto_hum_ratio: float
    deficit_hydrique: float
    regime_sol: int

    model_config = {"populate_by_name": True}

    def to_feature_dict(self) -> dict:
        """Retourne les features dans le bon ordre avec les noms du modèle."""
        return {
            "temp_max": self.temp_max, "temp_min": self.temp_min,
            "temp_moy": self.temp_moy, "delta_temp": self.delta_temp,
            "humidite_air": self.humidite_air, "vent": self.vent,
            "rayonnement": self.rayonnement, "pluie": self.pluie,
            "ET0_mm": self.ET0_mm, "ETc": self.ETc,
            "humidite_sol_avant_%": self.humidite_sol_avant_pct,
            "humidite_sol_rolling3": self.humidite_sol_rolling3,
            "jour_annee": self.jour_annee, "mois": self.mois,
            "jour_semaine": self.jour_semaine,
            "humidite_sol_j-1": self.humidite_sol_j1,
            "pluie_j-1": self.pluie_j1, "ETc_j-1": self.ETc_j1,
            "pluie_3j": self.pluie_3j, "eto_hum_ratio": self.eto_hum_ratio,
            "deficit_hydrique": self.deficit_hydrique, "regime_sol": self.regime_sol,
        }

class ShapFactor(BaseModel):
    feature: str
    label_fr: str
    label_ar: str
    contribution: float

class PredictionResponse(BaseModel):
    parcel_id: str
    should_irrigate: bool
    irrigation_probability: float
    water_amount_mm: float
    water_amount_raw_mm: float
    bias_applied_mm: float
    top_factors: List[ShapFactor]
    demo_mode: bool
    model_version: str
    # --- Champs alimentant le projection PostgreSQL (recommendation-service) ---
    # Durée d'irrigation en minutes. Non calculable ici (dépend du débit et de la
    # surface de la parcelle, absents du PredictionRequest) → laissé à None et
    # potentiellement dérivé côté recommendation-service.
    duration_minutes: Optional[int] = None
    # Humidité du sol au moment de la génération (feature d'entrée).
    soil_humidity_pct: Optional[float] = None
    # Évapotranspiration de référence au moment de la génération (feature d'entrée).
    eto: Optional[float] = None
    # Horodatage de génération (ISO 8601 UTC). Sert de clé d'idempotence côté
    # recommendation-service (parcel_id, generated_at).
    generated_at: Optional[str] = None

"""
Al Katra Bel Qatra — Model Service (version finale scalable)
============================================================

Objectif :
- Parité stricte avec model_IA.ipynb (régression conditionnelle, biais seulement si irrigation).
- Explications via pred_contribs du régresseur (top 5) avec labels FR/AR.
- Chargement robuste depuis MLflow Registry.
- Structure dynamique : ajouter/supprimer une feature = modifier uniquement FEATURE_NAMES et FEATURE_LABELS.

Attributs de PredictionRequest portent exactement le même nom que les features.
"""

import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from typing import Optional

import joblib
import mlflow
import numpy as np
import pandas as pd
import xgboost as xgb
from mlflow.tracking import MlflowClient

from app.config import settings
from app.schemas.prediction import PredictionRequest, PredictionResponse, ShapFactor

logger = logging.getLogger(__name__)

from app.core.metrics import DEMO_MODE, MODELS_LOADED

# ------------------------------------------------------------------
# CONFIGURATION CENTRALE (source unique de vérité)
# ------------------------------------------------------------------
CLASSIFIER_MODEL_NAME = "AlKatra-Classifier"
REGRESSOR_MODEL_NAME = "AlKatra-Regressor"
CLASSIFICATION_THRESHOLD = 0.35
TOP_N_FACTORS = 5

FEATURE_NAMES = [
    "temp_max", "temp_min", "temp_moy", "delta_temp",
    "humidite_air", "vent", "rayonnement", "pluie",
    "ET0_mm", "ETc",
    "humidite_sol_avant_%", "humidite_sol_rolling3",
    "jour_annee", "mois", "jour_semaine",
    "humidite_sol_j-1", "pluie_j-1", "ETc_j-1", "pluie_3j",
    "eto_hum_ratio", "deficit_hydrique", "regime_sol",
]

FEATURE_LABELS = {
    "temp_max": ("Température max", "أقصى حرارة"),
    "temp_min": ("Température min", "أدنى حرارة"),
    "temp_moy": ("Température moyenne", "متوسط الحرارة"),
    "delta_temp": ("Amplitude thermique", "المدى الحراري"),
    "humidite_air": ("Humidité air", "رطوبة الهواء"),
    "vent": ("Vitesse du vent", "سرعة الريح"),
    "rayonnement": ("Rayonnement solaire", "الإشعاع الشمسي"),
    "pluie": ("Pluie du jour", "شتا اليوم"),
    "ET0_mm": ("Evapotranspiration ETo", "التبخر والنتح المرجعي"),
    "ETc": ("Evapotranspiration culture", "التبخر والنتح للزراعة"),
    "humidite_sol_avant_%": ("Humidité sol actuelle", "رطوبة التربة الحالية"),
    "humidite_sol_rolling3": ("Humidité sol moyenne 3j", "متوسط رطوبة التربة 3 أيام"),
    "jour_annee": ("Jour de l'année", "يوم السنة"),
    "mois": ("Mois", "الشهر"),
    "jour_semaine": ("Jour de la semaine", "يوم الأسبوع"),
    "humidite_sol_j-1": ("Humidité sol hier", "رطوبة التربة البارح"),
    "pluie_j-1": ("Pluie hier", "شتا البارح"),
    "ETc_j-1": ("ETc hier", "التبخر البارح"),
    "pluie_3j": ("Cumul pluie 3j", "مجموع الشتا 3 أيام"),
    "eto_hum_ratio": ("Ratio ETo/humidité", "نسبة التبخر/الرطوبة"),
    "deficit_hydrique": ("Déficit hydrique", "العجز المائي"),
    "regime_sol": ("Régime du sol", "نظام التربة"),
}


class ModelService:
    """Service de prédiction d'irrigation (classifieur + régresseur XGBoost)."""

    def __init__(self) -> None:
        self._classifier: Optional[xgb.Booster] = None
        self._regressor: Optional[xgb.Booster] = None
        self._bias: pd.Series = pd.Series(dtype="float64")
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)

    # ------------------------------------------------------------------
    # CHARGEMENT
    # ------------------------------------------------------------------
    def load_models(self) -> None:
        """Charge les deux modèles + le biais Digital Twin."""
        logger.info("Chargement des modèles depuis MLflow Registry…")
        self._classifier = self._load_booster(CLASSIFIER_MODEL_NAME)
        self._regressor = self._load_booster(REGRESSOR_MODEL_NAME)
        self._bias = self._load_bias()
        logger.info("✅ Modèles + biais chargés avec succès")

    def _load_booster(self, model_name: str) -> xgb.Booster:
        """Charge un Booster depuis le Model Registry (stage Production)."""
        model_uri = f"models:/{model_name}/Production"
        logger.info(f"  → {model_uri}")
        model = mlflow.xgboost.load_model(model_uri)
        if isinstance(model, xgb.XGBModel):
            model = model.get_booster()
        return model

    def _load_bias(self) -> pd.Series:
        """Charge le dictionnaire de biais Digital Twin (fichier .joblib)."""
        try:
            client = MlflowClient(tracking_uri=settings.MLFLOW_TRACKING_URI)
            run_id = None
            for exp in client.search_experiments():
                runs = client.search_runs(
                    experiment_ids=[exp.experiment_id],
                    filter_string="attributes.run_name = 'digital-twin-bias-registration'",
                    max_results=1,
                    order_by=["start_time DESC"],
                )
                if runs:
                    run_id = runs[0].info.run_id
                    break

            if run_id is None:
                logger.warning("⚠️ Run biais introuvable → bias=0.0 partout")
                return pd.Series(dtype="float64")

            with tempfile.TemporaryDirectory() as tmp:
                local_path = client.download_artifacts(
                    run_id, "bias/champ_bias_dict.joblib", tmp
                )
                bias = joblib.load(local_path)

            if not isinstance(bias, pd.Series):
                bias = pd.Series(bias, dtype="float64")
            bias = bias.clip(-5.0, 5.0)
            logger.info(f"✅ Biais Digital Twin chargé : {len(bias)} parcelles")
            return bias
        except Exception as e:
            logger.warning(f"⚠️ Échec chargement biais ({e}) → bias=0.0 partout")
            return pd.Series(dtype="float64")

    # ------------------------------------------------------------------
    # PRÉDICTION
    # ------------------------------------------------------------------
    def predict(self, req: PredictionRequest) -> PredictionResponse:
        """Effectue la prédiction complète (classification + régression conditionnelle)."""
        if self._classifier is None or self._regressor is None:
            raise RuntimeError("Modèles non chargés. Appelez load_models() d'abord.")

        X = self._build_feature_frame(req)
        dmatrix = xgb.DMatrix(X, feature_names=FEATURE_NAMES)

        # 1. Classification
        proba = float(self._classifier.predict(dmatrix)[0])
        should_irrigate = proba >= CLASSIFICATION_THRESHOLD

        # 2. Régression conditionnelle (parité notebook)
        water_amount = 0.0
        water_amount_raw = 0.0
        bias_applied = 0.0
        if should_irrigate:
            pred_log = float(self._regressor.predict(dmatrix)[0])
            q_pred = float(np.expm1(pred_log))
            water_amount_raw = q_pred
            bias_applied = float(self._bias.get(req.parcel_id, 0.0))
            water_amount = max(0.0, q_pred + bias_applied)
            water_amount = round(water_amount * 2) / 2  # arrondi 0.5 mm

        # 3. Explications (pred_contribs du régresseur)
        top_factors = self._top_factors(dmatrix)

        return PredictionResponse(
            parcel_id=req.parcel_id,
            should_irrigate=should_irrigate,
            irrigation_probability=round(proba, 4),
            water_amount_mm=round(water_amount, 2),
            water_amount_raw_mm=round(water_amount_raw, 2),
            bias_applied_mm=round(bias_applied, 2),
            top_factors=top_factors,
            demo_mode=self.demo_mode,
            model_version="1.0.0",
            # Champs projetés vers PostgreSQL par le recommendation-service.
            # duration_minutes non calculable ici (débit/surface indisponibles).
            duration_minutes=None,
            soil_humidity_pct=req.humidite_sol_avant_pct,
            eto=req.ET0_mm,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    def _build_feature_frame(self, req: PredictionRequest) -> pd.DataFrame:
        """Construit le DataFrame 22 features dans l'ordre exact de FEATURE_NAMES.
        
        Utilise to_feature_dict() pour gérer correctement les alias
        contenant des caractères spéciaux (%, -) dans les noms de features.
        """
        row = req.to_feature_dict()
        return pd.DataFrame([row], columns=FEATURE_NAMES)

    def _top_factors(self, dmatrix: xgb.DMatrix) -> list[ShapFactor]:
        """Retourne les top facteurs via pred_contribs du régresseur (labels FR/AR inclus)."""
        contribs = self._regressor.predict(dmatrix, pred_contribs=True)[0]
        feat_contribs = list(zip(FEATURE_NAMES, contribs[:-1]))  # on exclut le biais
        feat_contribs.sort(key=lambda x: abs(x[1]), reverse=True)

        result = []
        for name, val in feat_contribs[:TOP_N_FACTORS]:
            fr, ar = FEATURE_LABELS.get(name, (name, name))
            result.append(
                ShapFactor(
                    feature=name,
                    label_fr=fr,
                    label_ar=ar,
                    contribution=round(float(val), 4),
                )
            )
        return result


# Instanciation globale du service
model_service = ModelService()

# Wrapper pour chargement avec fallback demo
def load() -> None:
    """Charge les modèles en réessayant plusieurs fois avant de basculer en mode démo.

    Utilise `MODEL_LOAD_RETRIES` et `MODEL_LOAD_DELAY` depuis `settings`.
    """
    retries = settings.MODEL_LOAD_RETRIES
    delay = settings.MODEL_LOAD_DELAY
    for attempt in range(1, retries + 1):
        try:
            model_service.load_models()
            model_service.demo_mode = False
            MODELS_LOADED.set(2)
            DEMO_MODE.set(0)
            return
        except Exception as e:
            logger.warning(
                "Échec chargement modèles (essai %d/%d) : %s",
                attempt,
                retries,
                e,
            )
            if attempt < retries:
                time.sleep(delay)

    logger.error("Échec multiple du chargement des modèles → bascule en demo_mode")
    model_service.demo_mode = True
    MODELS_LOADED.set(0)
    DEMO_MODE.set(1)

# Propriétés exposées
model_service.load = load
model_service.demo_mode = False
"""Tests mode DEMO — compatibles CI (pas de MLflow)."""
from app.services.model_service import ModelService
from app.schemas.prediction import PredictionRequest


def _make_demo_request(parcel_id: str = "parcel_test_001") -> PredictionRequest:
    """Crée une PredictionRequest avec des valeurs par défaut pour le mode DEMO."""
    return PredictionRequest(
        parcel_id=parcel_id,
        temp_max=34.7, temp_min=13.2, temp_moy=24.0, delta_temp=21.5,
        humidite_air=61.3, vent=4.1, rayonnement=22.8, pluie=3.4,
        ET0_mm=5.2, ETc=4.1, humidite_sol_avant_pct=46.5,
        humidite_sol_rolling3=45.0, jour_annee=142, mois=5, jour_semaine=3,
        humidite_sol_j1=48.0, pluie_j1=0.0, ETc_j1=4.0,
        pluie_3j=3.4, eto_hum_ratio=0.084, deficit_hydrique=0.7, regime_sol=1,
    )


def test_demo_mode_response():
    svc = ModelService()
    svc.demo_mode = True
    req = _make_demo_request()
    resp = svc.predict(req)
    assert resp.demo_mode is True
    assert resp.parcel_id == "parcel_test_001"
    assert 0.0 <= resp.irrigation_probability <= 1.0
    assert len(resp.top_factors) >= 1


def test_feature_names_count():
    from app.schemas.prediction import FEATURE_NAMES
    assert len(FEATURE_NAMES) == 22


def test_to_feature_dict_matches_feature_names():
    """Vérifie que to_feature_dict() produit exactement les clés de FEATURE_NAMES."""
    from app.schemas.prediction import FEATURE_NAMES
    req = _make_demo_request()
    d = req.to_feature_dict()
    assert list(d.keys()) == FEATURE_NAMES

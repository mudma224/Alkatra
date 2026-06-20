"""Test endpoint /predict en mode DEMO."""
from fastapi.testclient import TestClient
from app.services.model_service import model_service
from app.main import app


def _payload():
    return {
        "parcel_id": "parcel_test_001",
        "temp_max": 34.7, "temp_min": 13.2, "temp_moy": 24.0, "delta_temp": 21.5,
        "humidite_air": 61.3, "vent": 4.1, "rayonnement": 22.8, "pluie": 3.4,
        "ET0_mm": 5.2, "ETc": 4.1, "humidite_sol_avant_%": 46.5,
        "humidite_sol_rolling3": 45.0, "jour_annee": 142, "mois": 5, "jour_semaine": 3,
        "humidite_sol_j-1": 48.0, "pluie_j-1": 0.0, "ETc_j-1": 4.0,
        "pluie_3j": 3.4, "eto_hum_ratio": 0.084, "deficit_hydrique": 0.7, "regime_sol": 1,
    }


def test_predict_demo():
    model_service.demo_mode = True
    client = TestClient(app)
    r = client.post("/predict", json=_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["parcel_id"] == "parcel_test_001"
    assert "should_irrigate" in body

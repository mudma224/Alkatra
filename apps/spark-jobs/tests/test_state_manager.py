"""
Tests unitaires — state_manager.py
Utilise fakeredis pour ne pas dépendre d'un vrai Redis.
"""
import json
import pytest
import fakeredis
from unittest.mock import patch

import jobs.state_manager as sm


@pytest.fixture(autouse=True)
def fake_redis_client():
    """Remplace le client Redis réel par fakeredis."""
    fake = fakeredis.FakeRedis(decode_responses=True)
    with patch.object(sm, "_redis_client", fake):
        yield fake


class TestGetParcelState:
    def test_premier_jour_zeros(self):
        """Parcel inconnue → toutes les valeurs à 0."""
        state = sm.get_parcel_state("parcel_inconnu")
        assert state["soil_humidity_j1"] == 0.0
        assert state["rain_j1"] == 0.0
        assert state["etc_j1"] == 0.0
        assert state["rain_j2"] == 0.0
        assert state["rain_j3"] == 0.0
        assert state["soil_humidity_rolling3"] == 0.0

    def test_apres_premier_jour(self, fake_redis_client):
        """Après 1 update, J-1 contient les valeurs du jour 1."""
        sm.update_parcel_state("p001", soil_humidity_pct=55.0, rain_mm=2.5, etc=4.2)
        # Simuler passage au jour suivant : day0 → day1
        sm.update_parcel_state("p001", soil_humidity_pct=48.0, rain_mm=0.0, etc=5.1)

        state = sm.get_parcel_state("p001")
        assert state["soil_humidity_j1"] == pytest.approx(55.0)
        assert state["rain_j1"] == pytest.approx(2.5)
        assert state["etc_j1"] == pytest.approx(4.2)

    def test_rolling3_moyenne(self, fake_redis_client):
        """soil_humidity_rolling3 est la moyenne des 3 derniers jours."""
        sm.update_parcel_state("p002", 60.0, 0.0, 4.0)  # Jour 1
        sm.update_parcel_state("p002", 55.0, 1.0, 4.5)  # Jour 2
        sm.update_parcel_state("p002", 50.0, 0.5, 5.0)  # Jour 3
        sm.update_parcel_state("p002", 45.0, 0.0, 5.5)  # Jour 4 (actuel)

        state = sm.get_parcel_state("p002")
        # J-1=50, J-2=55, J-3=60 → moyenne = 55.0
        assert state["soil_humidity_rolling3"] == pytest.approx(55.0, abs=1.0)


class TestUpdateParcelState:
    def test_cle_redis_creee(self, fake_redis_client):
        sm.update_parcel_state("p_test", 42.0, 1.5, 3.8)
        key = "alkatra:state:p_test:day0"
        raw = fake_redis_client.get(key)
        assert raw is not None
        data = json.loads(raw)
        assert data["soil_humidity_pct"] == 42.0
        assert data["rain_mm"] == 1.5
        assert data["etc"] == 3.8

    def test_ttl_defini(self, fake_redis_client):
        sm.update_parcel_state("p_ttl", 50.0, 0.0, 4.0)
        ttl = fake_redis_client.ttl("alkatra:state:p_ttl:day0")
        assert ttl > 0
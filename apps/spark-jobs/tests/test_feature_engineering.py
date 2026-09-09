"""
Tests unitaires — feature_engineering.py (sans Spark, sans Redis).
"""
import math
import pytest
from jobs.feature_engineering import (
    calculate_eto,
    get_kc_olivier,
    compute_derived_features,
)


class TestCalculateEto:
    def test_valeurs_typiques_maroc(self):
        """Valeur plausible pour un jour d'été au Maroc."""
        eto = calculate_eto(
            temp_max_c=34.7,
            temp_min_c=13.2,
            air_humidity_pct=61.3,
            wind_speed_ms=4.1,
            solar_radiation_mj_m2_day=22.8,
        )
        assert 4.0 < eto < 10.0, f"ETo hors plage attendue: {eto}"

    def test_hiver_eto_faible(self):
        """ETo faible en hiver (moins de rayonnement, températures basses)."""
        eto = calculate_eto(
            temp_max_c=15.0,
            temp_min_c=5.0,
            air_humidity_pct=70.0,
            wind_speed_ms=2.0,
            solar_radiation_mj_m2_day=8.0,
        )
        assert 0.5 < eto < 4.0, f"ETo hiver hors plage: {eto}"

    def test_eto_non_negatif(self):
        """ETo ne peut pas être négatif."""
        eto = calculate_eto(
            temp_max_c=5.0,
            temp_min_c=4.0,
            air_humidity_pct=99.0,
            wind_speed_ms=0.1,
            solar_radiation_mj_m2_day=1.0,
        )
        assert eto >= 0.0

    def test_exemple_contrat_capteur(self):
        """
        Valeurs de l'exemple dans iot-sensor-payload.md :
        temperature_min_c=13.2, temperature_max_c=34.7,
        wind_speed_ms=4.1, solar_radiation_mj_m2_day=22.8,
        air_humidity_pct=61.3
        """
        eto = calculate_eto(
            temp_max_c=34.7,
            temp_min_c=13.2,
            air_humidity_pct=61.3,
            wind_speed_ms=4.1,
            solar_radiation_mj_m2_day=22.8,
        )
        # Pas de valeur de référence exacte, on vérifie la plausibilité
        assert isinstance(eto, float)
        assert eto > 0


class TestGetKcOlivier:
    def test_ete(self):
        assert get_kc_olivier(7) == 0.70   # Juillet

    def test_printemps(self):
        assert get_kc_olivier(4) == 0.65   # Avril

    def test_hiver(self):
        assert get_kc_olivier(1) == 0.55   # Janvier

    def test_automne(self):
        assert get_kc_olivier(10) == 0.60  # Octobre

    def test_decembre_comme_hiver(self):
        assert get_kc_olivier(12) == 0.55


class TestComputeDerivedFeatures:
    def _default_state(self):
        return dict(
            soil_humidity_j1=0.0,
            rain_j1=0.0,
            etc_j1=0.0,
            rain_j2=0.0,
            rain_j3=0.0,
            soil_humidity_rolling3=0.0,
        )

    def test_cles_presentes(self):
        """Toutes les 22 features du modèle doivent être présentes."""
        expected_keys = [
            "temp_max", "temp_min", "temp_moy", "delta_temp",
            "humidite_air", "vent", "rayonnement", "pluie",
            "ET0_mm", "ETc",
            "humidite_sol_avant_%", "humidite_sol_rolling3",
            "jour_annee", "mois", "jour_semaine",
            "humidite_sol_j-1", "pluie_j-1", "ETc_j-1", "pluie_3j",
            "eto_hum_ratio", "deficit_hydrique", "regime_sol",
        ]
        result = compute_derived_features(
            temp_max_c=34.7, temp_min_c=13.2,
            air_humidity_pct=61.3, wind_speed_ms=4.1,
            solar_radiation_mj_m2_day=22.8, rain_mm_day=3.4,
            soil_humidity_pct=46.5,
            month=6, day_of_year=160, day_of_week=2,
            **self._default_state(),
        )
        for key in expected_keys:
            assert key in result, f"Feature manquante : {key}"

    def test_temp_moy_calcul(self):
        result = compute_derived_features(
            temp_max_c=30.0, temp_min_c=10.0,
            air_humidity_pct=50.0, wind_speed_ms=3.0,
            solar_radiation_mj_m2_day=15.0, rain_mm_day=0.0,
            soil_humidity_pct=50.0,
            month=7, day_of_year=200, day_of_week=0,
            **self._default_state(),
        )
        assert result["temp_moy"] == 20.0
        assert result["delta_temp"] == 20.0

    def test_pluie_3j_cumul(self):
        result = compute_derived_features(
            temp_max_c=30.0, temp_min_c=15.0,
            air_humidity_pct=60.0, wind_speed_ms=2.0,
            solar_radiation_mj_m2_day=18.0, rain_mm_day=1.0,
            soil_humidity_pct=55.0,
            month=5, day_of_year=130, day_of_week=3,
            soil_humidity_j1=50.0,
            rain_j1=2.0,
            etc_j1=3.0,
            rain_j2=1.5,
            rain_j3=0.5,
            soil_humidity_rolling3=48.0,
        )
        assert result["pluie_3j"] == pytest.approx(4.0)  # 2.0 + 1.5 + 0.5

    def test_regime_sol_sec(self):
        result = compute_derived_features(
            temp_max_c=38.0, temp_min_c=20.0,
            air_humidity_pct=30.0, wind_speed_ms=5.0,
            solar_radiation_mj_m2_day=25.0, rain_mm_day=0.0,
            soil_humidity_pct=25.0,  # < 30 → sec
            month=8, day_of_year=220, day_of_week=1,
            **self._default_state(),
        )
        assert result["regime_sol"] == 0

    def test_regime_sol_normal(self):
        result = compute_derived_features(
            temp_max_c=30.0, temp_min_c=15.0,
            air_humidity_pct=50.0, wind_speed_ms=3.0,
            solar_radiation_mj_m2_day=20.0, rain_mm_day=0.0,
            soil_humidity_pct=45.0,  # 30–60 → normal
            month=4, day_of_year=100, day_of_week=4,
            **self._default_state(),
        )
        assert result["regime_sol"] == 1

    def test_regime_sol_humide(self):
        result = compute_derived_features(
            temp_max_c=20.0, temp_min_c=8.0,
            air_humidity_pct=80.0, wind_speed_ms=1.5,
            solar_radiation_mj_m2_day=10.0, rain_mm_day=5.0,
            soil_humidity_pct=75.0,  # > 60 → humide
            month=12, day_of_year=340, day_of_week=6,
            **self._default_state(),
        )
        assert result["regime_sol"] == 2

    def test_deficit_hydrique(self):
        """deficit_hydrique = ETc - pluie_3j"""
        result = compute_derived_features(
            temp_max_c=35.0, temp_min_c=18.0,
            air_humidity_pct=45.0, wind_speed_ms=4.0,
            solar_radiation_mj_m2_day=22.0, rain_mm_day=0.0,
            soil_humidity_pct=40.0,
            month=6, day_of_year=170, day_of_week=0,
            soil_humidity_j1=42.0,
            rain_j1=1.0,
            etc_j1=5.0,
            rain_j2=0.0,
            rain_j3=0.5,
            soil_humidity_rolling3=41.0,
        )
        expected_deficit = result["ETc"] - (1.0 + 0.0 + 0.5)
        assert result["deficit_hydrique"] == pytest.approx(expected_deficit)

    def test_premier_jour_zeros(self):
        """Premier jour d'utilisation : toutes les valeurs stateful à 0."""
        result = compute_derived_features(
            temp_max_c=28.0, temp_min_c=14.0,
            air_humidity_pct=55.0, wind_speed_ms=3.0,
            solar_radiation_mj_m2_day=18.0, rain_mm_day=0.0,
            soil_humidity_pct=50.0,
            month=3, day_of_year=80, day_of_week=2,
            soil_humidity_j1=0.0,
            rain_j1=0.0,
            etc_j1=0.0,
            rain_j2=0.0,
            rain_j3=0.0,
            soil_humidity_rolling3=0.0,
        )
        assert result["humidite_sol_j-1"] == 0.0
        assert result["pluie_j-1"] == 0.0
        assert result["pluie_3j"] == 0.0
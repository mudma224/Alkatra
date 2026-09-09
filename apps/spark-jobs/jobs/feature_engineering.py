"""
Al Katra Bel Qatra — Feature Engineering
Calcul ETo Penman-Monteith simplifié (FAO-56), Kc olivier, features temporelles.
Reproduit exactement le pipeline d'entraînement de model_IA.ipynb.
"""
import math
from typing import Optional


# ─────────────────────────────────────────────
# ETo — Formule Penman-Monteith simplifiée
# Reproduit data_generation.ipynb cellule "ETAPE 3"
# ─────────────────────────────────────────────

def calculate_eto(
    temp_max_c: float,
    temp_min_c: float,
    air_humidity_pct: float,
    wind_speed_ms: float,
    solar_radiation_mj_m2_day: float,
) -> float:
    """
    Calcul ETo FAO-56 simplifié.
    Paramètres identiques au contrat capteur (sensor-ai-v2).
    Retourne : ETo en mm/jour.
    """
    temp_moy = (temp_max_c + temp_min_c) / 2.0

    # Pression vapeur saturante (kPa)
    es = 0.6108 * math.exp((17.27 * temp_moy) / (temp_moy + 237.3))

    # Pression vapeur réelle (kPa)
    ea = es * (air_humidity_pct / 100.0)

    # Pente courbe vapeur (kPa/°C)
    delta = 4098 * es / ((temp_moy + 237.3) ** 2)

    # Constante psychrométrique
    gamma = 0.066

    # Rayonnement net approx (MJ/m²/jour)
    rn = solar_radiation_mj_m2_day * 0.77

    # Penman-Monteith simplifié
    numerator = (
        0.408 * delta * rn
        + gamma * (900 / (temp_moy + 273)) * wind_speed_ms * (es - ea)
    )
    denominator = delta + gamma * (1 + 0.34 * wind_speed_ms)

    if denominator == 0:
        return 0.0

    eto = numerator / denominator
    return max(0.0, round(eto, 6))


# ─────────────────────────────────────────────
# Kc olivier (FAO-56, conditions Maroc)
# Reproduit data_generation.ipynb cellule "ETAPE 4"
# ─────────────────────────────────────────────

def get_kc_olivier(month: int) -> float:
    """
    Coefficient cultural Kc pour olivier.
    Valeurs moyennes (centre de la distribution normale utilisée à l'entraînement).
    month : 1–12
    """
    if month in [12, 1, 2]:
        return 0.55
    elif month in [3, 4, 5]:
        return 0.65
    elif month in [6, 7, 8]:
        return 0.70
    else:  # 9, 10, 11
        return 0.60


# ─────────────────────────────────────────────
# Features dérivées
# ─────────────────────────────────────────────

def compute_derived_features(
    temp_max_c: float,
    temp_min_c: float,
    air_humidity_pct: float,
    wind_speed_ms: float,
    solar_radiation_mj_m2_day: float,
    rain_mm_day: float,
    soil_humidity_pct: float,
    month: int,
    day_of_year: int,
    day_of_week: int,
    # Features stateful (depuis Redis)
    soil_humidity_j1: float,
    rain_j1: float,
    etc_j1: float,
    rain_j2: float,
    rain_j3: float,
    soil_humidity_rolling3: float,
) -> dict:
    """
    Calcule toutes les features du modèle final.
    Reproduit exactement le feature set de model_IA.ipynb.
    """
    temp_moy = (temp_max_c + temp_min_c) / 2.0
    delta_temp = temp_max_c - temp_min_c

    eto = calculate_eto(
        temp_max_c,
        temp_min_c,
        air_humidity_pct,
        wind_speed_ms,
        solar_radiation_mj_m2_day,
    )

    kc = get_kc_olivier(month)
    etc = round(eto * kc, 6)

    # Ratio ETo / humidité (évite division par zéro)
    eto_hum_ratio = eto / (air_humidity_pct + 1)

    # Déficit hydrique : ETc - cumul pluie 3j
    pluie_3j = rain_j1 + rain_j2 + rain_j3
    deficit_hydrique = etc - pluie_3j

    # Régime sol : 0=sec (<30%), 1=normal (30-60%), 2=humide (>60%)
    if soil_humidity_pct < 30:
        regime_sol = 0
    elif soil_humidity_pct < 60:
        regime_sol = 1
    else:
        regime_sol = 2

    return {
        # Météo brute
        "temp_max": temp_max_c,
        "temp_min": temp_min_c,
        "temp_moy": temp_moy,
        "delta_temp": delta_temp,
        "humidite_air": air_humidity_pct,
        "vent": wind_speed_ms,
        "rayonnement": solar_radiation_mj_m2_day,
        "pluie": rain_mm_day,
        # Agronomie
        "ET0_mm": eto,
        "ETc": etc,
        "humidite_sol_avant_%": soil_humidity_pct,
        "humidite_sol_rolling3": soil_humidity_rolling3,
        # Temporel
        "jour_annee": day_of_year,
        "mois": month,
        "jour_semaine": day_of_week,
        # Mémoire (stateful)
        "humidite_sol_j-1": soil_humidity_j1,
        "pluie_j-1": rain_j1,
        "ETc_j-1": etc_j1,
        "pluie_3j": pluie_3j,
        # Features dérivées
        "eto_hum_ratio": eto_hum_ratio,
        "deficit_hydrique": deficit_hydrique,
        "regime_sol": regime_sol,
    }
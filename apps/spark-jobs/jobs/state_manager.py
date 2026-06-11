"""
Al Katra Bel Qatra — Gestionnaire d'état journalier par parcelle.
Stocke dans Redis les valeurs des 3 derniers jours par parcel_id.
Clés Redis : alkatra:state:<parcel_id>:day0  (jour actuel)
             alkatra:state:<parcel_id>:day1  (J-1)
             alkatra:state:<parcel_id>:day2  (J-2)
TTL : 5 jours (sécurité)
"""
import json
import logging
import os
from typing import Optional

import redis

logger = logging.getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "alkatra_redis_pass")
STATE_TTL_SECONDS = 5 * 24 * 3600  # 5 jours

_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            decode_responses=True,
        )
    return _redis_client


def _key(parcel_id: str, day_offset: int) -> str:
    """day_offset : 0=aujourd'hui, 1=J-1, 2=J-2"""
    return f"alkatra:state:{parcel_id}:day{day_offset}"


def get_parcel_state(parcel_id: str) -> dict:
    """
    Retourne l'état des 3 derniers jours pour une parcelle.
    Si aucune donnée → valeurs nulles (1er jour d'utilisation).
    """
    r = get_redis()

    default = {
        "soil_humidity_pct": 0.0,
        "rain_mm": 0.0,
        "etc": 0.0,
    }

    try:
        day1_raw = r.get(_key(parcel_id, 1))
        day2_raw = r.get(_key(parcel_id, 2))
        day3_raw = r.get(_key(parcel_id, 3))

        day1 = json.loads(day1_raw) if day1_raw else default.copy()
        day2 = json.loads(day2_raw) if day2_raw else default.copy()
        day3 = json.loads(day3_raw) if day3_raw else default.copy()

        # rolling3 : moyenne humidité J-1, J-2, J-3
        # (approximation avec ce qu'on a)
        humidity_values = [
            day1["soil_humidity_pct"],
            day2["soil_humidity_pct"],
            day3["soil_humidity_pct"],
        ]
        non_zero = [v for v in humidity_values if v > 0]
        soil_humidity_rolling3 = (
            sum(non_zero) / len(non_zero) if non_zero else 0.0
        )

        return {
            # J-1
            "soil_humidity_j1": day1["soil_humidity_pct"],
            "rain_j1": day1["rain_mm"],
            "etc_j1": day1["etc"],
            # J-2 et J-3 (pour pluie_3j)
            "rain_j2": day2["rain_mm"],
            "rain_j3": day3["rain_mm"],
            # Rolling 3j
            "soil_humidity_rolling3": soil_humidity_rolling3,
        }

    except Exception as e:
        logger.warning(f"Redis state read error for {parcel_id}: {e} — using zeros")
        return {
            "soil_humidity_j1": 0.0,
            "rain_j1": 0.0,
            "etc_j1": 0.0,
            "rain_j2": 0.0,
            "rain_j3": 0.0,
            "soil_humidity_rolling3": 0.0,
        }


def update_parcel_state(
    parcel_id: str,
    soil_humidity_pct: float,
    rain_mm: float,
    etc: float,
) -> None:
    """
    Rotation journalière :
    day3 ← day2 ← day1 ← day0 (nouveau)
    Appelé après chaque message traité (idempotent dans la journée
    car day0 est écrasé — seul le dernier message du jour compte).
    """
    r = get_redis()

    try:
        # Lire day0 actuel avant d'écraser
        day0_raw = r.get(_key(parcel_id, 0))

        if day0_raw:
            # Rotation : décaler d'un jour
            day1_raw = r.get(_key(parcel_id, 1))
            day2_raw = r.get(_key(parcel_id, 2))

            if day2_raw:
                r.setex(_key(parcel_id, 3), STATE_TTL_SECONDS, day2_raw)
            if day1_raw:
                r.setex(_key(parcel_id, 2), STATE_TTL_SECONDS, day1_raw)
            r.setex(_key(parcel_id, 1), STATE_TTL_SECONDS, day0_raw)

        # Écrire le nouveau day0
        new_state = json.dumps({
            "soil_humidity_pct": soil_humidity_pct,
            "rain_mm": rain_mm,
            "etc": etc,
        })
        r.setex(_key(parcel_id, 0), STATE_TTL_SECONDS, new_state)

    except Exception as e:
        logger.error(f"Redis state write error for {parcel_id}: {e}")
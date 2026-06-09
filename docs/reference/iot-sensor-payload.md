# Reference - Contrat payload capteur IoT

Ce contrat est la source de verite pour les messages capteurs consommes par `apps/iot-service` et publies dans Kafka topic `raw-sensor-data`.

## Version

```text
sensor-ai-v2
```

Cette version est ajoutee par `iot-service` dans le message Kafka enrichi.

## Topic MQTT

```text
alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{device_id}/data
```

Exemple:

```text
alkatra/farm/farm_test_001/parcel/parcel_test_001/sensor/esp32-sim-001/data
```

## Champs obligatoires venant du capteur

| Champ | Type | Unite | Description |
| --- | --- | --- | --- |
| `temperature_min_c` | number | degres Celsius | temperature minimale observee |
| `temperature_max_c` | number | degres Celsius | temperature maximale observee |
| `wind_speed_ms` | number | m/s | vitesse du vent |
| `solar_radiation_mj_m2_day` | number | MJ/m^2/jour | rayonnement solaire journalier |
| `soil_humidity_pct` | number | % | humidite du sol |
| `air_humidity_pct` | number | % | humidite de l'air |
| `rain_mm_day` | number | mm/jour | pluie journaliere |

## Metadonnees recommandees

| Champ | Type | Source |
| --- | --- | --- |
| `ts` | number | timestamp Unix secondes |
| `device_id` | string | capteur |
| `farm_id` | string | ferme |
| `parcel_id` | string | parcelle |

`iot-service` peut extraire `device_id`, `farm_id` et `parcel_id` depuis le topic MQTT. Il est quand meme recommande de les inclure dans le payload pour faciliter le debug.

## Exemple MQTT entrant

```json
{
  "ts": 1710000000,
  "device_id": "esp32-sim-001",
  "farm_id": "farm_test_001",
  "parcel_id": "parcel_test_001",
  "temperature_min_c": 13.2,
  "temperature_max_c": 34.7,
  "wind_speed_ms": 4.1,
  "solar_radiation_mj_m2_day": 22.8,
  "soil_humidity_pct": 46.5,
  "air_humidity_pct": 61.3,
  "rain_mm_day": 3.4
}
```

## Exemple Kafka sortant

```json
{
  "schema_version": "sensor-ai-v2",
  "ts": 1710000000,
  "device_id": "esp32-sim-001",
  "farm_id": "farm_test_001",
  "parcel_id": "parcel_test_001",
  "temperature_min_c": 13.2,
  "temperature_max_c": 34.7,
  "wind_speed_ms": 4.1,
  "solar_radiation_mj_m2_day": 22.8,
  "soil_humidity_pct": 46.5,
  "air_humidity_pct": 61.3,
  "rain_mm_day": 3.4,
  "received_at": "2026-05-22T11:00:00.000Z",
  "is_anomaly": false,
  "anomaly_reasons": []
}
```

## Regles de validation

Un payload est rejete si une des 7 variables IA est absente ou non numerique.

Les anomalies ne bloquent pas forcement l'envoi Kafka. Elles ajoutent:

```json
{
  "is_anomaly": true,
  "anomaly_reasons": ["..."]
}
```

## Alias acceptes temporairement

| Canonique | Alias |
| --- | --- |
| `temperature_min_c` | `temp_min_c`, `min_temperature_c` |
| `temperature_max_c` | `temp_max_c`, `max_temperature_c` |
| `wind_speed_ms` | `wind_speed_mps`, `wind_m_s` |
| `solar_radiation_mj_m2_day` | `solar_radiation`, `solar_mj_m2_day` |
| `soil_humidity_pct` | `soil_moisture_pct`, `soil_moisture_1` |
| `air_humidity_pct` | `air_humidity` |
| `rain_mm_day` | `rainfall_mm_day`, `rain_mm` |

Les alias existent pour transition. Les nouveaux producteurs doivent utiliser les noms canoniques.

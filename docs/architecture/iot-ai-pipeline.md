# Pipeline IoT vers IA

## Objectif

Le pipeline IoT doit transformer des messages capteurs en evenements Kafka propres, previsibles et compatibles avec le futur modele IA.

Le modele IA attend 7 variables terrain:

```text
temperature_min_c
temperature_max_c
wind_speed_ms
solar_radiation_mj_m2_day
soil_humidity_pct
air_humidity_pct
rain_mm_day
```

Les identifiants `farm_id`, `parcel_id`, `device_id` et `ts` sont des metadonnees de routage et tracabilite. Ils ne sont pas comptes comme variables IA.

## Flux detaille

1. Un capteur ou le simulateur publie un JSON sur MQTT.
2. Mosquitto recoit le message.
3. `iot-service` ecoute le topic wildcard:

```text
alkatra/farm/+/parcel/+/sensor/+/data
```

4. `MqttService` parse le JSON.
5. Il extrait `farm_id`, `parcel_id`, `device_id` depuis le topic.
6. Il verifie que les 7 variables IA sont presentes et numeriques.
7. Il detecte quelques anomalies simples.
8. Il enrichit le message.
9. Il publie dans Kafka sur `raw-sensor-data`.

## Message Kafka enrichi

Exemple simplifie:

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

## Cle Kafka

La cle Kafka est:

```text
{farm_id}:{parcel_id}
```

Cette cle garde les messages d'une meme parcelle dans la meme logique de partitionnement, ce qui simplifiera les traitements temporels futurs.

## Compatibilite temporaire avec anciens noms

`MqttService` accepte quelques alias pour faciliter la transition:

| Champ canonique | Alias acceptes |
| --- | --- |
| `temperature_min_c` | `temp_min_c`, `min_temperature_c` |
| `temperature_max_c` | `temp_max_c`, `max_temperature_c` |
| `wind_speed_ms` | `wind_speed_mps`, `wind_m_s` |
| `solar_radiation_mj_m2_day` | `solar_radiation`, `solar_mj_m2_day` |
| `soil_humidity_pct` | `soil_moisture_pct`, `soil_moisture_1` |
| `air_humidity_pct` | `air_humidity` |
| `rain_mm_day` | `rainfall_mm_day`, `rain_mm` |

Les nouveaux producteurs doivent utiliser les noms canoniques.

## Anomalies actuelles

Les controles actuels sont volontairement simples:

- temperature minimale trop basse;
- temperature maximale trop haute;
- temperature minimale superieure a la maximale;
- vitesse du vent negative ou tres elevee;
- rayonnement solaire negatif ou tres eleve;
- humidite du sol ou de l'air hors `[0, 100]`.
- pluie journaliere negative ou tres elevee.

Ces controles ne remplacent pas un vrai controle metier avance. Ils servent a eviter d'envoyer des valeurs absurdes aux etapes aval.

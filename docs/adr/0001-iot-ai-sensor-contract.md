# ADR 0001 - Contrat capteur compatible IA

## Statut

Accepte.

## Contexte

Le pipeline IoT utilisait initialement des champs capteurs orientes prototype:

- `soil_moisture_1`
- `soil_moisture_2`
- `soil_temp`
- `air_temp`
- `rain_mm`
- `ec`
- `battery_pct`

Le futur modele IA doit utiliser 6 variables precises:

- temperature minimale en degres Celsius;
- temperature maximale en degres Celsius;
- vitesse du vent en m/s;
- rayonnement solaire en MJ/m^2/jour;
- humidite du sol en pourcentage;
- humidite de l'air en pourcentage.

Sans contrat clair, les prochaines etapes ML risquent de recevoir des donnees incoherentes ou difficiles a transformer.

## Decision

Le contrat canonique capteur devient:

```text
temperature_min_c
temperature_max_c
wind_speed_ms
solar_radiation_mj_m2_day
soil_humidity_pct
air_humidity_pct
```

`iot-service` valide ces 6 champs avant publication Kafka.

Le message Kafka est enrichi avec:

```text
schema_version
received_at
is_anomaly
anomaly_reasons
```

La version actuelle est:

```text
sensor-ai-v1
```

## Consequences

Avantages:

- contrat stable pour les futurs services Spark/ML;
- moins de mapping ambigu;
- meilleure tracabilite grace a `schema_version`;
- tests plus proches du besoin IA.

Limites:

- les anciens producteurs doivent migrer;
- quelques alias sont acceptes temporairement, mais ne doivent pas devenir la norme.

## References

- [Contrat payload capteur](../reference/iot-sensor-payload.md)
- `apps/iot-service/src/mqtt/mqtt.service.ts`
- `scripts/simulate-sensor.js`

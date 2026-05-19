explication et justification de choix de la config de kafka dans le fichier docker-compose.yml :

Kafka = bus d’événements central

Il sert à :

recevoir les données capteurs (IoT)
bufferiser les flux
distribuer vers :
MongoDB
ML pipeline
dashboards


ce qui peut dependre de cette nouvelle configuration : 

-iot-service Kafka config
-spark job bootstrap servers
-topics.sh
-health-check.sh
-simulate-sensor.js


***Explication***


kafka:
  image: apache/kafka:3.9.1

apache/kafka :

 -image officielle (pas wrapper Bitnami)
 -support natif KRaft
 -moins de surprises

version 3.9.1 :

 -stable récente
 -support KRaft mature
 -meilleure perf réseau


ports:
    - "9092:9092"

-expose kafka vers localement 

KAFKA_NODE_ID: 1  

-ID unique du broker Kafka

KAFKA_PROCESS_ROLES: broker,controller

-Kafka devient :

  broker → stocke messages
  controller → gère cluster


KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093

-pourquoi 2 ports

   Kafka doit séparer :
        trafic utilisateur
        communication interne cluster

KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092

-Adresse publique annoncée aux clients

KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER

-Indique quel listener est utilisé pour controller

KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT

-Associe protocoles aux listeners

pourquoi PLAINTEXT

✔ dev simplifié
✔ pas de SSL

mais en production :

TLS obligatoire
SASL authentication


KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093

-Définit les controllers du cluster

KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

-Nombre de copies des topics internes Kafka mais en production on doit avoir plus 


kafka-ui

-Interface web Kafka
-Kafka UI se connecte via Docker network



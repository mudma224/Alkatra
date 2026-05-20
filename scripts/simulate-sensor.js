/**
 * Al Katra Bel Qatra — Simulateur Capteur ESP32
 * Node.js (MQTT natif) — remplace le script Bash fragile
 * Usage: node scripts/simulate-sensor.js [interval_ms]
 * Ex:    node scripts/simulate-sensor.js 10000   # toutes les 10s
 */

const mqtt = require('mqtt');

const INTERVAL_MS = parseInt(process.argv[2] || '30000', 10);
const MQTT_HOST   = process.env.MQTT_HOST     || 'localhost';
const MQTT_PORT   = parseInt(process.env.MQTT_PORT || '1883', 10);
const FARM_ID     = process.env.FARM_ID       || 'farm_test_001';
const PARCEL_ID   = process.env.PARCEL_ID     || 'parcel_test_001';
const DEVICE_ID   = process.env.DEVICE_ID     || 'esp32-sim-001';

const TOPIC = `alkatra/farm/${FARM_ID}/parcel/${PARCEL_ID}/sensor/${DEVICE_ID}/data`;

function rand(min, max, decimals = 1) {
  const v = Math.random() * (max - min) + min;
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePayload() {
  const rainChoices = [0, 0, 0, 0, 0, 0.2, 0.4, 1.2, 2.6, 5.0];
  return {
    ts:              Math.floor(Date.now() / 1000),
    device_id:       DEVICE_ID,
    farm_id:         FARM_ID,
    parcel_id:       PARCEL_ID,
    soil_moisture_1: rand(20, 70),
    soil_moisture_2: rand(25, 72),
    soil_temp:       rand(16, 38),
    air_temp:        rand(14, 44),
    air_humidity:    rand(28, 82),
    rain_mm:         rainChoices[randInt(0, rainChoices.length - 1)],
    ec:              rand(0.8, 2.5, 2),
    battery_pct:     randInt(42, 98),
  };
}

const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
  clientId: `alkatra-simulator-${Date.now()}`,
  reconnectPeriod: 3000,
});

let count = 0;

client.on('connect', () => {
  console.log(`🌿 Simulateur ESP32 connecté → mqtt://${MQTT_HOST}:${MQTT_PORT}`);
  console.log(`📡 Topic: ${TOPIC}`);
  console.log(`⏱️  Intervalle: ${INTERVAL_MS / 1000}s — Ctrl+C pour arrêter\n`);

  const sendMessage = () => {
    count++;
    const payload = generatePayload();
    const json = JSON.stringify(payload);

    client.publish(TOPIC, json, { qos: 1 }, (err) => {
      const time = new Date().toLocaleTimeString('fr-FR');
      if (err) {
        console.error(`[${time}] ❌ Erreur envoi: ${err.message}`);
      } else {
        console.log(
          `[${time}] #${count} ` +
          `Humidité: ${payload.soil_moisture_1}% | ` +
          `Sol: ${payload.soil_temp}°C | ` +
          `Pluie: ${payload.rain_mm}mm | ` +
          `Batterie: ${payload.battery_pct}%`
        );
      }
    });
  };

  sendMessage(); // Premier envoi immédiat
  setInterval(sendMessage, INTERVAL_MS);
});

client.on('error', (err) => {
  console.error(`❌ Erreur MQTT: ${err.message}`);
  console.error(`   Vérifiez que Mosquitto tourne: npm run docker:up`);
});

client.on('offline', () => {
  console.warn('⚠️  Client MQTT hors ligne — tentative reconnexion...');
});

process.on('SIGINT', () => {
  console.log(`\n🛑 Simulateur arrêté. ${count} messages envoyés.`);
  client.end();
  process.exit(0);
});
/**
 * Al Katra Bel Qatra - Simulateur Capteur ESP32
 * Publie le contrat capteur IA v1 vers MQTT.
 *
 * Usage: node scripts/simulate-sensor.js [interval_ms]
 * Ex:    node scripts/simulate-sensor.js 10000
 */

const mqtt = require('mqtt');

const INTERVAL_MS = parseInt(process.argv[2] || '30000', 10);
const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883', 10);
const FARM_ID = process.env.FARM_ID || 'farm_test_001';
const PARCEL_ID = process.env.PARCEL_ID || 'parcel_test_001';
const DEVICE_ID = process.env.DEVICE_ID || 'esp32-sim-001';

const TOPIC = `alkatra/farm/${FARM_ID}/parcel/${PARCEL_ID}/sensor/${DEVICE_ID}/data`;

function rand(min, max, decimals = 1) {
  const value = Math.random() * (max - min) + min;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function generatePayload() {
  const temperatureMin = rand(8, 24);
  const temperatureMax = rand(Math.max(temperatureMin + 3, 18), 46);

  return {
    ts: Math.floor(Date.now() / 1000),
    device_id: DEVICE_ID,
    farm_id: FARM_ID,
    parcel_id: PARCEL_ID,
    temperature_min_c: temperatureMin,
    temperature_max_c: temperatureMax,
    wind_speed_ms: rand(0.3, 12),
    solar_radiation_mj_m2_day: rand(8, 28),
    soil_humidity_pct: rand(18, 78),
    air_humidity_pct: rand(25, 88),
  };
}

const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
  clientId: `alkatra-simulator-${Date.now()}`,
  reconnectPeriod: 3000,
});

let count = 0;

client.on('connect', () => {
  console.log(`Simulateur ESP32 connecte -> mqtt://${MQTT_HOST}:${MQTT_PORT}`);
  console.log(`Topic: ${TOPIC}`);
  console.log(`Intervalle: ${INTERVAL_MS / 1000}s - Ctrl+C pour arreter\n`);

  const sendMessage = () => {
    count++;
    const payload = generatePayload();
    const json = JSON.stringify(payload);

    client.publish(TOPIC, json, { qos: 1 }, (err) => {
      const time = new Date().toLocaleTimeString('fr-FR');
      if (err) {
        console.error(`[${time}] Erreur envoi: ${err.message}`);
      } else {
        console.log(
          `[${time}] #${count} ` +
            `Tmin: ${payload.temperature_min_c}C | ` +
            `Tmax: ${payload.temperature_max_c}C | ` +
            `Vent: ${payload.wind_speed_ms}m/s | ` +
            `Solaire: ${payload.solar_radiation_mj_m2_day}MJ/m2/j | ` +
            `Sol: ${payload.soil_humidity_pct}% | ` +
            `Air: ${payload.air_humidity_pct}%`,
        );
      }
    });
  };

  sendMessage();
  setInterval(sendMessage, INTERVAL_MS);
});

client.on('error', (err) => {
  console.error(`Erreur MQTT: ${err.message}`);
  console.error('Verifiez que Mosquitto tourne: npm run docker:up');
});

client.on('offline', () => {
  console.warn('Client MQTT hors ligne - tentative reconnexion...');
});

process.on('SIGINT', () => {
  console.log(`\nSimulateur arrete. ${count} messages envoyes.`);
  client.end();
  process.exit(0);
});

#!/usr/bin/env node
/**
 * Al Katra Bel Qatra — Validation des index MongoDB
 * Usage: node scripts/validate-mongodb-indexes.js
 *
 * Prerequis : MongoDB doit etre demarre (docker compose up mongodb)
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb://alkatra:123@localhost:27017/alkatra_iot?authSource=admin';

const EXPECTED_INDEXES = [
  { name: 'farm_id_1_parcel_id_1_ts_-1' },
  { name: 'received_at_1' },           // TTL index 90 jours
  { name: 'device_id_1_ts_-1' },
];

async function validateIndexes() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('alkatra_iot');
    const collection = db.collection('ai_sensor_features');

    // Verifier que la collection existe
    const collections = await db.listCollections({ name: 'ai_sensor_features' }).toArray();
    if (collections.length === 0) {
      console.log('WARNING: Collection ai_sensor_features does not exist yet.');
      console.log('Elle sera creee automatiquement au premier insert.');
      return;
    }

    const indexes = await collection.indexes();
    console.log('\nIndex existants :');
    indexes.forEach(idx => {
      const hasTtl = idx.expireAfterSeconds !== undefined;
      console.log(`  - ${idx.name}${hasTtl ? ` (TTL: ${idx.expireAfterSeconds}s = ${idx.expireAfterSeconds / 86400} jours)` : ''}`);
    });

    // Verifier les index requis
    let allOk = true;
    EXPECTED_INDEXES.forEach(expected => {
      const found = indexes.find(idx => idx.name === expected.name);
      if (!found) {
        console.log(`\nMISSING INDEX: ${expected.name}`);
        allOk = false;
      }
    });

    // Verifier specifiquement le TTL index
    const ttlIndex = indexes.find(idx => idx.expireAfterSeconds !== undefined);
    if (!ttlIndex) {
      console.log('\nWARNING: Aucun TTL index trouve — les vieilles donnees ne seront pas supprimees automatiquement');
    } else if (ttlIndex.expireAfterSeconds !== 7776000) {
      console.log(`\nWARNING: TTL index = ${ttlIndex.expireAfterSeconds}s, attendu 7776000s (90 jours)`);
    } else {
      console.log('\nTTL index OK (90 jours)');
    }

    if (allOk) {
      console.log('\nResultat: Tous les index requis sont presents');
      process.exit(0);
    } else {
      console.log('\nResultat: Index manquants — redemarrer iot-service pour les creer');
      process.exit(1);
    }

  } catch (err) {
    console.error('Erreur connexion MongoDB:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

validateIndexes();
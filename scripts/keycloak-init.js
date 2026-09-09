#!/usr/bin/env node
/**
 * Script d'initialisation Keycloak — idempotent.
 * Crée le realm "alkatra" et le client "alkatra-web" s'ils n'existent pas déjà.
 * Usage : node scripts/keycloak-init.js
 */

const axios = require('axios');

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || '123';
const REALM_NAME = process.env.KEYCLOAK_REALM || 'alkatra';
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'alkatra-web';

async function getAdminToken() {
  const url = `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });

  const { data } = await axios.post(url, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  return data.access_token;
}

async function realmExists(token) {
  try {
    await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  } catch (error) {
    if (error.response?.status === 404) return false;
    throw error;
  }
}

async function createRealm(token) {
  await axios.post(
    `${KEYCLOAK_URL}/admin/realms`,
    {
      realm: REALM_NAME,
      enabled: true,
      displayName: 'Al Katra Bel Qatra',
      registrationAllowed: false,
      loginWithEmailAllowed: false,
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

async function clientExists(token) {
  const { data } = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { clientId: CLIENT_ID },
    },
  );
  return Array.isArray(data) && data.length > 0;
}

async function createClient(token) {
  await axios.post(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`,
    {
      clientId: CLIENT_ID,
      enabled: true,
      publicClient: true,
      protocol: 'openid-connect',
      redirectUris: ['http://localhost:5173/*'],
      webOrigins: ['http://localhost:5173'],
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

async function main() {
  console.log(`🚀 Initialisation Keycloak sur ${KEYCLOAK_URL}...`);

  const token = await getAdminToken();

  if (await realmExists(token)) {
    console.log(`ℹ️  Realm '${REALM_NAME}' existe déjà`);
  } else {
    await createRealm(token);
    console.log(`✅ Realm '${REALM_NAME}' créé`);
  }

  if (await clientExists(token)) {
    console.log(`ℹ️  Client '${CLIENT_ID}' existe déjà`);
  } else {
    await createClient(token);
    console.log(`✅ Client '${CLIENT_ID}' créé`);
  }

  console.log('✅ Initialisation Keycloak terminée');
}

main().catch((error) => {
  console.error('❌ Erreur lors de l’initialisation Keycloak :', error.message);
  process.exit(1);
});
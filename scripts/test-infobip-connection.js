#!/usr/bin/env node
/**
 * Script utilitaire de validation manuelle de la connexion Infobip.
 * Usage : INFOBIP_API_KEY=xxx INFOBIP_BASE_URL=xxx node scripts/test-infobip-connection.js +212XXXXXXXXX
 */
const axios = require('axios');

const apiKey = process.env.INFOBIP_API_KEY;
const baseUrl = process.env.INFOBIP_BASE_URL;
const phone = process.argv[2];

if (!apiKey || !baseUrl || !phone) {
  console.error(
    'Usage : INFOBIP_API_KEY=xxx INFOBIP_BASE_URL=xxx node scripts/test-infobip-connection.js +212XXXXXXXXX',
  );
  process.exit(1);
}

async function main() {
  try {
    const response = await axios.post(
      `${baseUrl}/sms/2/text/advanced`,
      {
        messages: [
          {
            destinations: [{ to: phone.replace('+', '') }],
            from: 'AlKatra',
            text: 'Test de connexion Infobip — Al Katra Bel Qatra (Sprint 1)',
          },
        ],
      },
      {
        headers: {
          Authorization: `App ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );
    console.log('✅ SMS envoyé avec succès :', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Échec de l’envoi :', error.response?.data ?? error.message);
    process.exit(1);
  }
}

main();
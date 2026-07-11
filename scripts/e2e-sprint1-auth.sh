#!/bin/bash
# Test E2E Sprint 1 — Al Katra Bel Qatra
# Vérifie le flux complet : inscription -> OTP -> login -> GET /api/v1/farms
set -e

AUTH_URL="http://localhost:3001/api/v1"
TEST_PHONE="+212600000001"

echo "🚀 Démarrage du test E2E Sprint 1..."

check_status() {
  local description=$1
  local expected=$2
  local actual=$3
  if [ "$actual" != "$expected" ]; then
    echo "❌ ÉCHEC : $description (attendu $expected, obtenu $actual)"
    exit 1
  fi
  echo "✅ $description"
}

# 1. Register
REGISTER_STATUS=$(curl -s -o /tmp/register.json -w "%{http_code}" -X POST "$AUTH_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$TEST_PHONE\"}")
check_status "POST /auth/register" "200" "$REGISTER_STATUS"

# 2. Extraction du code OTP depuis les logs (mode développement)
sleep 1
OTP_CODE=$(docker compose -f infra/docker/docker-compose.yml logs auth-service \
  | grep "DEV-OTP" | grep "$TEST_PHONE" | tail -1 | grep -oE '[0-9]{6}' | tail -1)

if [ -z "$OTP_CODE" ]; then
  echo "❌ ÉCHEC : impossible d'extraire le code OTP depuis les logs"
  exit 1
fi
echo "✅ Code OTP extrait : $OTP_CODE"

# 3. Verify OTP
VERIFY_STATUS=$(curl -s -o /tmp/verify.json -w "%{http_code}" -X POST "$AUTH_URL/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$TEST_PHONE\", \"otp\": \"$OTP_CODE\"}")
check_status "POST /auth/verify-otp" "200" "$VERIFY_STATUS"

ACCESS_TOKEN=$(jq -r '.accessToken' /tmp/verify.json)
REFRESH_TOKEN=$(jq -r '.refreshToken' /tmp/verify.json)

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ ÉCHEC : accessToken manquant dans la réponse verify-otp"
  exit 1
fi
echo "✅ accessToken et refreshToken reçus"

# 4. Login (refresh silencieux)
LOGIN_STATUS=$(curl -s -o /tmp/login.json -w "%{http_code}" -X POST "$AUTH_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$TEST_PHONE\", \"refreshToken\": \"$REFRESH_TOKEN\"}")
check_status "POST /auth/login" "200" "$LOGIN_STATUS"

NEW_ACCESS_TOKEN=$(jq -r '.accessToken' /tmp/login.json)

if [ "$NEW_ACCESS_TOKEN" == "$ACCESS_TOKEN" ]; then
  echo "❌ ÉCHEC : le token après /login devrait être différent du token initial"
  exit 1
fi
echo "✅ Nouvelle paire de tokens obtenue via /login"

# 5. GET /user/profile
PROFILE_STATUS=$(curl -s -o /tmp/profile.json -w "%{http_code}" -X GET "$AUTH_URL/user/profile" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN")
check_status "GET /user/profile (authentifié)" "200" "$PROFILE_STATUS"

PROFILE_PHONE=$(jq -r '.phone' /tmp/profile.json)
if [ "$PROFILE_PHONE" != "$TEST_PHONE" ]; then
  echo "❌ ÉCHEC : le téléphone du profil ne correspond pas"
  exit 1
fi
echo "✅ Profil utilisateur correct"

# 6. GET /farms avec token (endpoint DEV2)
FARMS_STATUS=$(curl -s -o /tmp/farms.json -w "%{http_code}" -X GET "$AUTH_URL/farms" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN")
check_status "GET /farms (authentifié)" "200" "$FARMS_STATUS"

FARMS_CONTENT=$(cat /tmp/farms.json)
if [ "$FARMS_CONTENT" != "[]" ]; then
  echo "⚠️  Avertissement : /farms n'a pas retourné un tableau vide (peut être normal si des données de test existent déjà)"
fi
echo "✅ GET /farms accessible avec un token valide"

# 7. GET /farms SANS token (doit échouer)
NO_AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$AUTH_URL/farms")
check_status "GET /farms (sans authentification, doit échouer)" "401" "$NO_AUTH_STATUS"

echo ""
echo "🎉 Test E2E Sprint 1 réussi : inscription → OTP → login → GET /farms"
pour tester avant expiration modifier ces paramètres dans docker-compose.yml (auth-service)

OTP_TTL_SECONDS: 3600
OTP_MAX_ATTEMPTS: 3
OTP_BLOCK_DURATION_SECONDS: 3600




1. Build
npm run build --workspace=@alkatra/auth-service
2. Lint
npm run lint --workspace=@alkatra/auth-service
3. Tests
npm run test --workspace=@alkatra/auth-service
4. Couverture
npm run test:cov --workspace=@alkatra/auth-service
5. Lancer Docker
docker compose --profile phase1 up -d
6. Register
$body = '{"phone":"+212612345678"}'

Invoke-WebRequest `
    -Uri http://localhost:3001/api/v1/auth/register `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $body

ou sur une seule ligne :

$body = '{"phone":"+212612345678"}'; Invoke-WebRequest -Uri http://localhost:3001/api/v1/auth/register -Method POST -Headers @{"Content-Type"="application/json"} -Body $body

7. Verify OTP (pour OTP tu dois le trouver avec: docker logs alkatra-auth 2>&1 | findstr "DEV-OTP")

$body = '{"phone":"+212601010101","otp":"666649"}'; Invoke-WebRequest -Uri http://localhost:3001/api/v1/auth/verify-otp -Method POST -Headers @{"Content-Type"="application/json"} -Body $body


***Et obtenir REFRESH_TOKEN avant que OTP a expiré :

$body = '{"phone":"+212601010101","otp":"OTP_OBTNU"}'          
$response = Invoke-WebRequest -Uri http://localhost:3001/api/v1/auth/verify-otp -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
$tokens = $response.Content | ConvertFrom-Json
Write-Host "Access Token: $($tokens.accessToken)"
Write-Host "Refresh Token: $($tokens.refreshToken)"


8. Login
$body = '{"phone":"+212601010101","refreshToken":"VOTRE_REFRESH_TOKEN"}'

Invoke-WebRequest `
    -Uri http://localhost:3001/api/v1/auth/login `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $body

9. Profile
Invoke-WebRequest `
    -Uri http://localhost:3001/api/v1/user/profile `
    -Headers @{
        Authorization = "Bearer VOTRE_ACCESS_TOKEN"
    }

10. Endpoint protégé

Invoke-WebRequest `
    -Uri http://localhost:3001/api/v1/farms `
    -Headers @{
        Authorization = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ZDlmYWJmOC1jOGE0LTRiZjMtODI1Mi1lODA2ZDBmYmE2ZmUiLCJwaG9uZSI6IisyMTI2MDEwMTAxMDEiLCJpYXQiOjE3ODM0NjU5NDYsImV4cCI6MTc4MzQ2OTU0Nn0.dHALFBDZetPRJiJplS_GDDDZtSa3NsBQfz-JxJMF2F0"
    }

Résultat attendu :

[]

11. Sans JWT
Invoke-WebRequest `
    -Uri http://localhost:3001/api/v1/farms

Résultat attendu :

401 Unauthorized

12. Dockerfile
docker build --target development .
docker build --target production .
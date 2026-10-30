# Creates (or updates) a staff account for the live project.
# Run it yourself from the repository root; it asks for the e-mail and password
# and never prints or stores them. The service-role key is fetched with the
# Supabase CLI from SUPABASE_ACCESS_TOKEN in the parent folder's .env.
#
#   powershell -ExecutionPolicy Bypass -File scripts\create-staff-user.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path (Split-Path -Parent $root) ".env"
if (-not (Test-Path $envFile)) { throw "No .env found at $envFile (needs SUPABASE_ACCESS_TOKEN=...)" }

$token = ((Get-Content $envFile | Select-String '^SUPABASE_ACCESS_TOKEN=').Line -replace '^SUPABASE_ACCESS_TOKEN=', '').Trim()
if (-not $token) { throw "SUPABASE_ACCESS_TOKEN missing in $envFile" }
$env:SUPABASE_ACCESS_TOKEN = $token

$ref = "btgslkrwlgodgdaomjnb"
Write-Host "Fetching the service-role key with the Supabase CLI..."
$keys = & npx supabase projects api-keys --project-ref $ref -o json | ConvertFrom-Json
$service = ($keys | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $service) { throw "service_role key not returned by the CLI; check SUPABASE_ACCESS_TOKEN" }

$email = Read-Host "Staff e-mail"
$secure = Read-Host "Staff password (typed hidden)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $email -or $plain.Length -lt 8) { throw "E-mail required and password must be at least 8 characters" }

$env:SUPABASE_URL = "https://$ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = $service
$env:STAFF_EMAIL = $email
$env:STAFF_PASSWORD = $plain
try {
  Push-Location $root
  & deno run -A scripts/create-staff-user.ts
} finally {
  Pop-Location
  Remove-Item Env:STAFF_PASSWORD, Env:SUPABASE_SERVICE_ROLE_KEY, Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
Write-Host "Done. Sign in on the site as Staff with that e-mail; change the password afterwards if it was temporary."

<#
Windows PowerShell helper to generate a secure API key and set GitHub repository secrets
and Heroku config var. Requires `gh` (GitHub CLI) and `heroku` CLI logged in.

Run from repository root in an elevated or normal PowerShell session:
    .\scripts\setup-secrets.ps1
#>

Set-StrictMode -Version Latest

function Check-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Error "$name not found in PATH. Install and authenticate it before running this script."
        exit 1
    }
}

Check-Command gh
Check-Command heroku
Check-Command node

$herokuApp = Read-Host "Heroku app name"
$herokuEmail = Read-Host "Heroku account email"

Write-Host "Generating a secure API key..."
$bytes = New-Object 'Byte[]' 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$apiKey = ([System.Convert]::ToHexString($bytes)).ToLower()
Write-Host "Generated API_KEY: $apiKey"

Write-Host "Setting GitHub repository secrets (you may be prompted by gh)."
gh secret set HEROKU_APP_NAME --body $herokuApp
gh secret set HEROKU_EMAIL --body $herokuEmail
gh secret set API_KEY --body $apiKey

Write-Host "Enter your Heroku API key (input hidden)"
$secureHeroku = Read-Host -AsSecureString "Heroku API key"
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureHeroku)
$plainHeroku = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)

gh secret set HEROKU_API_KEY --body $plainHeroku

$serverUrl = "https://$herokuApp.herokuapp.com"
gh secret set SERVER_URL --body $serverUrl

Write-Host "Setting Heroku config var API_KEY for app $herokuApp..."
heroku config:set API_KEY=$apiKey --app $herokuApp

Write-Host "All done. The repo secrets and Heroku config var have been set."
Write-Host "Push to main to trigger the Heroku deploy workflow (if configured)."

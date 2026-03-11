#!/usr/bin/env bash
set -euo pipefail

echo "This script helps you set GitHub repository secrets and Heroku config vars."
echo "Make sure you have 'gh' (GitHub CLI) and 'heroku' CLI installed and authenticated."

read -p "Heroku app name: " HEROKU_APP
read -p "Heroku account email: " HEROKU_EMAIL

echo "Generating a secure API key..."
API_KEY=$(node ./scripts/generate-key.js)
echo "Generated API_KEY: $API_KEY"

echo "Setting GitHub secrets (you'll be prompted to confirm)."
gh secret set HEROKU_APP_NAME --body "$HEROKU_APP"
gh secret set HEROKU_EMAIL --body "$HEROKU_EMAIL"
gh secret set API_KEY --body "$API_KEY"

echo "Please obtain a Heroku API key (from dashboard.heroku.com/account) and paste it now."
read -s -p "Heroku API key: " HEROKU_API_KEY
echo
gh secret set HEROKU_API_KEY --body "$HEROKU_API_KEY"

SERVER_URL="https://$HEROKU_APP.herokuapp.com"
gh secret set SERVER_URL --body "$SERVER_URL"

echo "Setting Heroku config var API_KEY for the app..."
heroku config:set API_KEY="$API_KEY" --app "$HEROKU_APP"

echo "All done. Workflow deploy will use these secrets on push to main."

# final-exam2
open source web chat app called simply `play-off`

Quick deploy helper
-------------------

Run the helper script locally to generate a secure API key, set GitHub repository secrets, and configure the Heroku app. Requirements:

- `gh` (GitHub CLI) logged in
- `heroku` CLI logged in
- `node` installed

From the repository root:

```bash
chmod +x scripts/setup-secrets.sh
./scripts/setup-secrets.sh
```

The script will ask for your Heroku app name and email, generate a secure `API_KEY`, set GitHub secrets (`HEROKU_APP_NAME`, `HEROKU_EMAIL`, `API_KEY`, `SERVER_URL`, `HEROKU_API_KEY`), and set the Heroku config var `API_KEY` on your app.


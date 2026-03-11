# Todo Sync Server

Minimal Express server to persist todo tasks. Protects endpoints with an API key provided via the `x-api-key` header. Set `API_KEY` in the environment before starting.

Start:

```bash
cd server
npm install
API_KEY=your_secret_key node index.js
```

Endpoints:
- `GET /tasks` — returns saved tasks (requires `x-api-key` header)
- `POST /tasks` — replace saved tasks with JSON array (requires `x-api-key` header)

Deploying to Heroku (quick)
----------------------------

1. Create a Heroku app and get your Heroku API key (from https://dashboard.heroku.com/account).
2. Set the following **GitHub repository secrets** (Repository → Settings → Secrets → Actions):
	- `HEROKU_API_KEY` — your Heroku API key
	- `HEROKU_APP_NAME` — the name of the Heroku app you created
	- `HEROKU_EMAIL` — your Heroku account email
3. Optionally set `SERVER_URL` to `https://<your-app-name>.herokuapp.com` and `API_KEY` to the application API key you will use for the todo server.

Once those secrets are set, pushes to `main` will trigger the workflow `.github/workflows/deploy-heroku.yml` and deploy the `server/` folder to Heroku.

Setting secrets using the GitHub CLI
-----------------------------------
If you prefer the CLI, install `gh` and run (replace values):

```bash
gh secret set HEROKU_API_KEY --body "<your_heroku_api_key>"
gh secret set HEROKU_APP_NAME --body "<your_heroku_app_name>"
gh secret set HEROKU_EMAIL --body "you@example.com"
gh secret set SERVER_URL --body "https://<your_heroku_app>.herokuapp.com"
gh secret set API_KEY --body "<your_app_api_key>"
```

Set Heroku runtime config var (so the server knows its API_KEY):

```bash
heroku config:set API_KEY="<your_app_api_key>" --app <your_heroku_app_name>
```

Generate a secure API key locally:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Notes
-----
- The GitHub Actions workflow uses the Heroku deploy action and requires `HEROKU_API_KEY`, `HEROKU_APP_NAME`, and `HEROKU_EMAIL` to be set as repository secrets.
- The `API_KEY` used by the todo server should be stored as a Heroku config var (or any secret manager) and should NOT be committed to the repository.

Firebase quick setup
--------------------
If you prefer Firebase (fastest way to get multi-device sync), do the following:

1. Create a Firebase project at https://console.firebase.google.com.
2. In the Firebase console enable **Authentication → Sign-in method → Google**.
3. Enable **Firestore Database** in test or production mode.
4. In **Project settings → Your apps** add a Web app and copy the firebase config object.
5. In `index.html`, before the `<script type="module" src="./src/firebase.js"></script>` line, add:

```html
<script>
	// Paste your Firebase config here (object from Firebase console)
	window.FIREBASE_CONFIG = {
		apiKey: "...",
		authDomain: "...",
		projectId: "...",
		// ...other fields
	};
</script>
```

6. Open the app and click **Sign in with Google**; your tasks will be stored under `users/{uid}/tasks` in Firestore and synced across devices.



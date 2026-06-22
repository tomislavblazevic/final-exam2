const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';

// ---------------------------------------------------------------------------
// In-memory store — on Heroku the filesystem is ephemeral so file-based
// persistence would silently lose data on every dyno restart.  Clients are
// expected to POST the full task list on every save, so in-memory is fine
// for a single-dyno deployment.  Swap for a real DB (Postgres / Redis) if
// you need true persistence across restarts.
// ---------------------------------------------------------------------------
let storedTasks = [];

function requireKey(req, res, next) {
  const key = req.header('x-api-key') || '';
  if (!API_KEY) {
    return res.status(500).json({ error: 'Server not configured with API_KEY' });
  }
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Health check — Heroku router uses this to verify the dyno is alive
app.get('/', (req, res) => res.json({ status: 'ok', service: 'todo-sync-server' }));

app.get('/tasks', requireKey, (req, res) => {
  res.json(storedTasks);
});

app.post('/tasks', requireKey, (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected array of tasks' });
  }
  storedTasks = body;
  res.json({ status: 'ok', count: storedTasks.length });
});

// Catch-all for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — prevents unhandled exceptions from crashing the dyno
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

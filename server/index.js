const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const DATA_FILE = path.join(__dirname, 'tasks.json');

function readTasks() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function writeTasks(tasks) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

function requireKey(req, res, next) {
  const key = req.header('x-api-key') || '';
  if (!API_KEY) {
    return res.status(500).send('Server not configured with API_KEY');
  }
  if (key !== API_KEY) return res.status(401).send('Invalid API key');
  next();
}

app.get('/tasks', requireKey, (req, res) => {
  const tasks = readTasks();
  res.json(tasks);
});

app.post('/tasks', requireKey, (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).send('Expected array of tasks');
  writeTasks(body);
  res.json({ status: 'ok', count: body.length });
});

app.get('/', (req, res) => res.send('Todo sync server'));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

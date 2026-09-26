/**
 * TypeSpeed - Backend Server
 * Express.js server handling static files, score persistence, and leaderboard API.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve current directory path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const SCORES_FILE = path.join(__dirname, 'scores.json');

// Middleware: Parse incoming JSON request bodies
app.use(express.json());

// Middleware: Serve static frontend files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store for IP-based rate limiting (1 submission per 10 seconds)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds

/**
 * Helper: Strip HTML tags to prevent stored XSS attacks
 * @param {string} str
 * @returns {string} Sanitized string
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * Helper: Ensure scores.json exists and load existing scores
 * @returns {Array} Array of score objects
 */
function loadScores() {
  try {
    if (!fs.existsSync(SCORES_FILE)) {
      // Create empty file if missing
      fs.writeFileSync(SCORES_FILE, JSON.stringify([], null, 2), 'utf-8');
      return [];
    }
    const data = fs.readFileSync(SCORES_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading scores.json:', error);
    return [];
  }
}

/**
 * Helper: Save scores array to scores.json
 * @param {Array} scores
 */
function saveScores(scores) {
  try {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing scores.json:', error);
    throw new Error('Failed to save score to database');
  }
}

/**
 * Helper: Sort scores descending by WPM, then by accuracy
 * @param {Array} scores
 * @param {number} limit
 * @returns {Array} Top scores
 */
function getTopScores(scores, limit = 10) {
  return [...scores]
    .sort((a, b) => {
      if (b.wpm !== a.wpm) {
        return b.wpm - a.wpm;
      }
      return b.accuracy - a.accuracy;
    })
    .slice(0, limit);
}

// ==========================================
// API ROUTES
// ==========================================

/**
 * GET /api/scores
 * Returns top 10 scores sorted by WPM descending
 */
app.get('/api/scores', (req, res) => {
  try {
    const scores = loadScores();
    const top10 = getTopScores(scores, 10);
    res.json(top10);
  } catch (error) {
    console.error('Failed to retrieve scores:', error);
    res.status(500).json({ error: 'Internal server error while fetching scores' });
  }
});

/**
 * POST /api/scores
 * Submit a new typing score and return the updated top 10 leaderboard
 * Body: { name: string, wpm: number, accuracy: number }
 */
app.post('/api/scores', (req, res) => {
  try {
    const { name, wpm, accuracy } = req.body;

    // Validate name
    const sanitizedName = sanitizeString(name);
    if (!sanitizedName || sanitizedName.length === 0) {
      return res.status(400).json({ error: 'Player name is required.' });
    }
    if (sanitizedName.length > 20) {
      return res.status(400).json({ error: 'Player name must be 20 characters or fewer.' });
    }

    // Validate WPM
    const numericWpm = Number(wpm);
    if (isNaN(numericWpm) || numericWpm < 0 || numericWpm > 300) {
      return res.status(400).json({ error: 'WPM must be a valid number between 0 and 300.' });
    }

    // Validate Accuracy
    const numericAccuracy = Number(accuracy);
    if (isNaN(numericAccuracy) || numericAccuracy < 0 || numericAccuracy > 100) {
      return res.status(400).json({ error: 'Accuracy must be a valid percentage between 0 and 100.' });
    }

    // Basic IP-based rate limiting (checked only after input format is valid)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const lastSubmission = rateLimitMap.get(clientIp);

    if (lastSubmission && now - lastSubmission < RATE_LIMIT_WINDOW_MS) {
      const remainingSeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastSubmission)) / 1000);
      return res.status(429).json({
        error: `Please wait ${remainingSeconds}s before submitting another score.`
      });
    }

    // Update rate limit timestamp
    rateLimitMap.set(clientIp, now);

    // Create score record
    const newScore = {
      id: `score_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: sanitizedName,
      wpm: Math.round(numericWpm),
      accuracy: Math.round(numericAccuracy),
      date: new Date().toISOString()
    };

    // Load, append and save scores
    const allScores = loadScores();
    allScores.push(newScore);
    saveScores(allScores);

    // Return the updated top 10 list and the new score ID for frontend highlighting
    const top10 = getTopScores(allScores, 10);
    res.status(201).json({
      message: 'Score submitted successfully!',
      newScoreId: newScore.id,
      leaderboard: top10
    });
  } catch (error) {
    console.error('Failed to submit score:', error);
    res.status(500).json({ error: 'Internal server error while saving score.' });
  }
});

// Fallback to index.html for root path
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, '0.0.0.0', () => {
  console.log(`TypeSpeed server running on http://0.0.0.0:${PORT}`);
});

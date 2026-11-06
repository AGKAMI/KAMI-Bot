/**
 * Load .env file (panel env vars take precedence)
 * VIDEO_API_KEY, FASTSAVER_KEY, SESSION_ID, etc. can be set here.
 * Values already in process.env (from the hosting panel) are NOT overwritten.
 */
try {
  const fs = require('fs');
  const envPath = __dirname + '/../.env';
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    const lines = env.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  }
} catch { /* .env missing or unreadable — fine, env vars come from panel */ }

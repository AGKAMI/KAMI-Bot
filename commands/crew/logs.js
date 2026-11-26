/**
 * Crew Logs Command — pull the agent-facing bot log for debugging.
 * Owner-only. Sends database/bot.log as a WhatsApp document so agents can
 * grep structured NDJSON entries without asking KAMI to fish it out.
 *
 * Usage: .crew logs  (from DM or crew group, owner only)
 */

const fs = require('fs');
const path = require('path');
const database = require('../../database');
const config = require('../../config');

const LOG_FILE = path.join(__dirname, '..', '..', 'database', 'bot.log');

module.exports = {
  subName: 'logs',
  name: null,
  aliases: ['log'],
  category: 'crew',
  description: 'Pull the bot agent log (database/bot.log) — owner only',
  usage: '.crew logs',
  groupOnly: false,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';

    if (!fs.existsSync(LOG_FILE)) {
      return extra.reply(
        '📭 *NO LOG FILE YET*\n\n' +
        'database/bot.log has not been created yet — no apply (or other logged) ' +
        'command has run since the logger was deployed.\n\n' +
        'Run `' + prefix + 'crew apply <team>` once to initialise it.'
      );
    }

    let stats;
    try {
      stats = fs.statSync(LOG_FILE);
    } catch (e) {
      console.error('[CREW LOGS] stat failed:', e.message);
      return extra.reply('❌ ERROR\n\nCould not read the log file: ' + e.message);
    }

    const sizeKB = (stats.size / 1024).toFixed(1);

    // Bound the read — bot.log grows forever, and loading the whole file
    // twice (text + document buffer) is an OOM on a 256MB box. Past the cap
    // only the tail window is read, and the caption says so.
    const MAX_READ = 4 * 1024 * 1024;
    let raw;
    let truncated = false;
    try {
      if (stats.size > MAX_READ) {
        truncated = true;
        const fd = fs.openSync(LOG_FILE, 'r');
        try {
          const buf = Buffer.alloc(MAX_READ);
          fs.readSync(fd, buf, 0, MAX_READ, stats.size - MAX_READ);
          raw = buf.toString('utf8').replace(/^[^\n]*\n/, ''); // drop the partial first line
        } finally {
          fs.closeSync(fd);
        }
      } else {
        raw = fs.readFileSync(LOG_FILE, 'utf8');
      }
    } catch (e) {
      console.error('[CREW LOGS] read failed:', e.message);
      return extra.reply('❌ ERROR\n\nCould not read the log file: ' + e.message);
    }

    const lines = raw.split('\n').filter(Boolean);
    const lineCount = lines.length;

    const tail = lines.slice(-200);

    let summary =
      '📋 *BOT LOG SNAPSHOT*\n\n' +
      '📄 File: database/bot.log\n' +
      '📏 Size: ' + sizeKB + ' KB\n' +
      '🔢 Lines: ' + lineCount + (truncated ? '+' : ' total') + ' (showing last 200)\n\n' +
      '_Recent entries:\n';

    for (const l of tail) {
      try {
        const e = JSON.parse(l);
        const ts = e.timestamp ? e.timestamp.slice(11, 19) : '??:??:??';
        summary += '  [' + ts + '] ' + e.type + ':' + (e.command || e.step || '-') + '\n';
      } catch (err) {
        summary += '  ' + l.slice(0, 90) + '\n';
      }
    }

    // Same window the summary was built from — no second full-file read
    const buffer = Buffer.from(raw, 'utf8');

    try {
      await sock.sendMessage(extra.from, {
        document: buffer,
        fileName: 'bot.log',
        mimetype: 'text/plain',
        caption: summary,
      }, { quoted: msg });
    } catch (docErr) {
      console.error('[CREW LOGS] document send failed:', docErr.message);
      await extra.reply(
        '📋 *BOT LOG (text fallback)*\n\n' + summary + '\n' +
        'Document send failed — the log file is ' + sizeKB + ' KB' +
        (truncated ? ' (last 4 MB window).' : '.') + '\n' +
        '_Ask KAMI to pull database/bot.log from the server directly._'
      );
    }
  },
};

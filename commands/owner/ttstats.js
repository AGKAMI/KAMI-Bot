/**
 * TT Stats — provider health for the TikTok downloader.
 * Owner-only: shows per-provider success/fail counts, the last failure
 * reason, and lets the owner reset the counters.
 *
 * Why: the box's IP reputation with TikTok-adjacent services rotates
 * (tikwm 403s, embed 400s, tikcdn placeholders all happened within a
 * week). This shows a provider dying BEFORE users start complaining.
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { voice } = require('../../utils/format');

const STATS_PATH = path.join(__dirname, '../../database/ttStats.json');

module.exports = {
  name: 'ttstats',
  category: 'owner',
  description: 'TikTok downloader provider health (success/fail per provider)',
  usage: '.ttstats [reset]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      if ((args[0] || '').toLowerCase() === 'reset') {
        fs.writeFileSync(STATS_PATH, JSON.stringify({ providers: {}, updated: Date.now() }, null, 2));
        return extra.reply(`✅ SUCCESS\n\nTT provider stats reset`);
      }

      let stats;
      try {
        stats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
      } catch (e) {
        return extra.reply(`📊 *TT STATS*\n\nNo data yet — run \`${config.prefix || '.'}tt <link>\` first`);
      }

      const providers = Object.entries(stats.providers || {});
      if (providers.length === 0) {
        return extra.reply(`📊 *TT STATS*\n\nNo data yet — run \`${config.prefix || '.'}tt <link>\` first`);
      }

      let text = `📊 *TT PROVIDER HEALTH*\n\n`;
      for (const [name, p] of providers) {
        const total = p.ok + p.fail;
        const pct = total ? Math.round((p.ok / total) * 100) : 0;
        const bar = pct >= 80 ? '🟢' : pct >= 50 ? '🟡' : '🔴';
        text += `${bar} *${name}*: ${p.ok}✅ / ${p.fail}❌ (${pct}%)\n`;
        if (p.lastFail) text += `   └ last fail: _${p.lastFail}_\n`;
      }
      if (stats.updated) {
        text += `\n_clock updated: ${new Date(stats.updated).toLocaleString('en-ZA', { timeZone: config.timezone || 'Africa/Johannesburg' })}_\n`;
      }
      text += `\n_Reset with \`${config.prefix || '.'}ttstats reset\`_`;

      await extra.reply(text);
    } catch (error) {
      extra.fail();
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — ${error.message}`);
    }
  }
};

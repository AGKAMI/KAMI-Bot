const database = require('../../database');
const config = require('../../config');

module.exports = {
  name: 'activity',
  aliases: ['audit', 'log'],
  description: 'View admin activity or command audit log',
  usage: 'activity [admin @mention] [days]',
  isCrew: true,

  execute: async (sock, msg, args, extra) => {
    const { from, sender, isOwner, isGroup } = extra;
    const prefix = config.prefix;
    const crewConfig = config.crewTeams || {};

    // Only owner can view activity
    if (!isOwner) {
      return extra.reply(
        '❌ ACCESS DENIED\n\n' +
        'Only the owner can view activity logs'
      );
    }

    const teamGroups = Object.keys(crewConfig);

    // Parse args: check for @mention (specific admin) or days number
    let targetAdmin = null;
    let days = 7;

    for (const arg of args) {
      if (arg.startsWith('@') && arg.length > 5) {
        targetAdmin = arg.replace(/[^0-9]/g, '');
      } else if (/^\d+$/.test(arg) && parseInt(arg) <= 30) {
        days = parseInt(arg);
      }
    }

    // Also check quoted message for JID
    const quotedJid = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quotedJid && !targetAdmin) {
      targetAdmin = quotedJid.split(':')[0].split('@')[0].replace(/\D/g, '');
    }

    const since = Date.now() - (days * 24 * 60 * 60 * 1000);

    if (targetAdmin) {
      // Show specific admin's activity
      const entries = database.getAuditLog({ user: `${targetAdmin}@s.whatsapp.net`, since });

      if (entries.length === 0) {
        return extra.reply(
          `📋 ACTIVITY LOG\n\n` +
          `No activity found for @${targetAdmin} in the last ${days} days`,
          { mentions: [`${targetAdmin}@s.whatsapp.net`] }
        );
      }

      // Tally
      const tally = { commands: 0, accepted: 0, denied: 0, cancelled: 0, rerolled: 0, protection: 0 };
      for (const e of entries) {
        if (e.type === 'command') tally.commands++;
        if (e.type === 'admin_action') {
          if (e.action === 'accepted') tally.accepted++;
          else if (e.action === 'denied') tally.denied++;
          else if (e.action === 'cancelled') tally.cancelled++;
          else if (e.action === 'rerolled') tally.rerolled++;
        }
        if (e.type === 'protection') tally.protection++;
      }

      // Get recent commands (last 10)
      const recent = entries.filter(e => e.type === 'command').slice(-10);

      let text =
        `📋 ADMIN ACTIVITY — @${targetAdmin}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `📅 Last ${days} days\n\n`;

      if (tally.accepted > 0 || tally.denied > 0 || tally.cancelled > 0 || tally.rerolled > 0) {
        text += `📝 *APPLICATIONS*\n`;
        if (tally.accepted > 0) text += `  ✅ Accepted: ${tally.accepted}\n`;
        if (tally.denied > 0) text += `  ❌ Denied: ${tally.denied}\n`;
        if (tally.cancelled > 0) text += `  🚫 Cancelled: ${tally.cancelled}\n`;
        if (tally.rerolled > 0) text += `  🔄 Rerolled: ${tally.rerolled}\n`;
        text += `\n`;
      }

      text += `⚡ *COMMANDS:* ${tally.commands}\n`;
      if (tally.protection > 0) text += `🛡️ *PROTECTION EVENTS:* ${tally.protection}\n`;

      if (recent.length > 0) {
        text += `\n📜 *RECENT COMMANDS*\n`;
        for (const e of recent.slice(-5)) {
          const time = new Date(e.timestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
          text += `  \`${time}\` ${e.command}${e.args ? ' ' + e.args : ''}\n`;
        }
      }

      return extra.reply(text, { mentions: [`${targetAdmin}@s.whatsapp.net`] });
    }

    // Show all admin activity
    const activity = database.getAdminActivity(days);

    if (Object.keys(activity).length === 0) {
      return extra.reply(
        `📋 ACTIVITY LOG\n\n` +
        `No admin activity in the last ${days} days`
      );
    }

    let text =
      `📋 ADMIN ACTIVITY — ALL\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📅 Last ${days} days\n\n`;

    for (const [adminJid, stats] of Object.entries(activity)) {
      const num = adminJid.split('@')[0].replace(/\D/g, '');
      const total = stats.accepted + stats.denied + stats.cancelled + stats.rerolled;
      text += `@${num}\n`;
      if (total > 0) {
        text += `  ✅ ${stats.accepted} accepted · ❌ ${stats.denied} denied · 🚫 ${stats.cancelled} cancelled · 🔄 ${stats.rerolled} rerolled\n`;
      }
      text += `  ⚡ ${stats.commands} commands\n\n`;
    }

    // Show protection events
    const protections = database.getAuditLog({ type: 'protection', since });
    if (protections.length > 0) {
      text += `🛡️ *PROTECTION EVENTS:* ${protections.length}\n`;
      for (const p of protections.slice(-3)) {
        const targetNum = p.target ? p.target.split('@')[0].replace(/\D/g, '') : 'unknown';
        const time = new Date(p.timestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
        text += `  \`${time}\` ${p.action} @${targetNum} → ${p.result}\n`;
      }
    }

    // Collect all unique JIDs for mentions
    const mentions = Object.keys(activity);

    return extra.reply(text, { mentions });
  },
};

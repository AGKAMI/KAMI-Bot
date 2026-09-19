/**
 * Members Command - Show group member count
 */

const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'members',
  aliases: ['membercount', 'count'],
  category: 'general',
  description: 'Show group member count',
  usage: '.members',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, groupMetadata } = extra;

      if (!groupMetadata || !groupMetadata.participants) {
        return await extra.reply(`❌ *ERROR*\n\nCouldn't fetch group info, ${pick(SLANG.error)}`);
      }

      const participants = groupMetadata.participants;
      const total = participants.length;
      const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length;
      const bots = participants.filter(p => {
        const num = (p.id || p.jid || '').split('@')[0];
        return num === sock.user?.id?.split(':')[0] || num === sock.user?.id?.split('@')[0];
      }).length;
      const humans = total - bots;

      const text = [
        `👥 *MEMBERS*`,
        '',
        `- 👤 ${bold('Total:')} ${total}`,
        `- 🛡️ ${bold('Admins:')} ${admins}`,
        `- 🤖 ${bold('Bots:')} ${bots}`,
        `- 🧑 ${bold('Humans:')} ${humans}`,
        '',
        `- 📛 ${bold('Group:')} ${groupMetadata.subject || 'Unknown'}`,
        `- 📝 ${bold('Created:')} ${groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toLocaleDateString('en-ZA') : 'Unknown'}`,
        "",
        `_${pick(SLANG.vibe)} — ${total} member${total > 1 ? 's' : ''} strong_`
      ].join('\n');

      await extra.reply(text);

    } catch (error) {
      console.error('Members Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};

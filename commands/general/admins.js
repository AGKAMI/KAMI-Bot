/**
 * Admins Command - List all group admins
 */

const { bold, pick, SLANG, mention } = require('../../utils/format');

module.exports = {
  name: 'admins',
  aliases: ['adminlist', 'listadmin'],
  category: 'general',
  description: 'List all group admins',
  usage: '.admins',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, groupMetadata } = extra;

      if (!groupMetadata || !groupMetadata.participants) {
        return await extra.reply(`❌ *ERROR*\n\nCouldn't fetch group info, ${pick(SLANG.error)}`);
      }

      const participants = groupMetadata.participants;
      const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

      if (admins.length === 0) {
        return await extra.reply(`👥 *ADMINS*\n\nNo admins found in this group, ${pick(SLANG.vibe)}`);
      }

      const lines = [
        `👑 *ADMINS*`,
        '',
        `- 👥 ${bold('Total:')} ${admins.length}`,
        ''
      ];

      for (let i = 0; i < admins.length; i++) {
        const admin = admins[i];
        const jid = admin.id || admin.jid;
        const tag = mention(jid);
        const role = admin.admin === 'superadmin' ? '👑 Superadmin' : '🛡️ Admin';

        lines.push(`${i + 1}. ${tag} — ${role}`);
      }

      lines.push('');
      lines.push(`_${pick(SLANG.vibe)} — ${admins.length} admin${admins.length > 1 ? 's' : ''} running this group_`);

      const mentionList = admins.map(a => a.id || a.jid);

      await sock.sendMessage(from, { text: lines.join('\n'), mentions: mentionList }, { quoted: msg });

    } catch (error) {
      console.error('Admins Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};

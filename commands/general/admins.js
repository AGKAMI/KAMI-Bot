/**
 * Admins Command - List all group admins
 */

const { bold, pick, SLANG, mention, voice } = require('../../utils/format');

module.exports = {
  name: 'admins',
  reactions: { received: '🛡️', done: '👥' },
  aliases: ['adminlist', 'listadmin'],
  category: 'general',
  description: 'List all group admins',
  usage: '.admins',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, groupMetadata } = extra;

      if (!groupMetadata || !groupMetadata.participants) {
        extra.fail();
        return await extra.reply(`❌ *ERROR*\n\nCouldn't fetch group info, ${voice.tag('err')}`);
      }

      const participants = groupMetadata.participants;
      const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

      if (admins.length === 0) {
        return await extra.reply(`👥 *ADMINS*\n\nNo admins found in this group, ${voice.tag('err')}`);
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
      lines.push(`_${voice.open()} — ${admins.length} admin${admins.length > 1 ? 's' : ''} running this group_`);

      const mentionList = admins.map(a => a.id || a.jid);

      await sock.sendMessage(from, { text: lines.join('\n'), mentions: mentionList }, { quoted: msg });

    } catch (error) {
      console.error('Admins Error:', error);
      extra.fail();
      await extra.reply(`❌ *ERROR*\n\n${voice.openErr()} — ${error.message}`);
    }
  }
};

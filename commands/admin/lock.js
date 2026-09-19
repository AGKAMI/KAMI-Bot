/**
 * Lock Command - Lock/unlock group settings (name, desc, pp)
 */

const { bold, pick, SLANG } = require('../../utils/format');
const database = require('../../database');

module.exports = {
  name: 'lock',
  aliases: ['unlock', 'lockstatus'],
  category: 'admin',
  description: 'Lock/unlock group settings (name, desc, profile pic)',
  usage: '.lock / .unlock / .lock status',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from } = extra;
      const sub = (args[0] || '').toLowerCase();
      const settings = database.getGroupSettings(from);

      if (sub === 'status' || sub === '') {
        const isLocked = settings.lock || false;
        const icon = isLocked ? '🔒' : '🔓';
        const label = isLocked ? 'LOCKED' : 'UNLOCKED';

        const text = [
          `${icon} *GROUP ${label}*`,
          '',
          `- 🔑 ${bold('Status:')} ${isLocked ? 'Only admins can change name, desc & pp' : 'Anyone can change name, desc & pp'}`,
          `- 👥 ${bold('Group:')} ${extra.groupMetadata?.subject || 'Unknown'}`,
          '',
          `_💡 Use .lock to lock, .unlock to unlock, ${pick(SLANG.vibe)}_`
        ].join('\n');

        return await extra.reply(text);
      }

      if (sub === 'on' || sub === 'lock') {
        database.updateGroupSettings(from, { lock: true });

        try {
          await sock.groupSettingUpdate(from, 'announcement');
        } catch (e) {
          // If WhatsApp API fails, still track in DB
        }

        const text = [
          `🔒 *GROUP LOCKED*`,
          '',
          `- ✅ ${bold('Setting updated')}: Only admins can change group name, description & profile pic`,
          `- 🔑 ${bold('Applied by')} @${extra.sender.split('@')[0]}`,
          '',
          `_${pick(SLANG.good)} — group secured, ${pick(SLANG.vibe)}_`
        ].join('\n');

        return await sock.sendMessage(from, { text, mentions: [extra.sender] }, { quoted: msg });
      }

      if (sub === 'off' || sub === 'unlock') {
        database.updateGroupSettings(from, { lock: false });

        try {
          await sock.groupSettingUpdate(from, 'not_announcement');
        } catch (e) {
          // If WhatsApp API fails, still track in DB
        }

        const text = [
          `🔓 *GROUP UNLOCKED*`,
          '',
          `- ✅ ${bold('Setting updated')}: Everyone can change group name, description & profile pic`,
          `- 🔑 ${bold('Applied by')} @${extra.sender.split('@')[0]}`,
          '',
          `_${pick(SLANG.vibe)} — group opened up_`
        ].join('\n');

        return await sock.sendMessage(from, { text, mentions: [extra.sender] }, { quoted: msg });
      }

      return await extra.reply(
        `❌ *ERROR*\n\n💡 Usage:\n- .lock → lock group\n- .unlock → unlock group\n- .lock status → check status`
      );

    } catch (error) {
      console.error('Lock Error:', error);
      await extra.reply(`❌ *ERROR*\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  }
};

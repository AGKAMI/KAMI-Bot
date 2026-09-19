/**
 * Snipe Command - See last deleted message in group
 */

const snipeStore = require('../../utils/snipeStore');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'snipe',
  aliases: ['deleted', 'lastdel'],
  category: 'admin',
  description: 'See last deleted message in group',
  usage: '.snipe',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const last = snipeStore.get(extra.from);

      if (!last) {
        return extra.reply(
          `❌ *NO DELETED MESSAGE*\n\n` +
          `_No deleted message stored for this group, ${pick(SLANG.vibe)}_\n\n` +
          `_Make sure message logging is active_`
        );
      }

      const timeAgo = getTimeAgo(last.timestamp);
      const number = last.sender.split('@')[0];

      let text = `🔔 *SNIPE*\n\n`;
      text += `👤 *Who deleted:* @${number}\n`;
      text += `💬 *Message:* ${last.text || '_[media/no text]_'}\n`;
      text += `⏰ *When:* ${timeAgo}\n`;

      await sock.sendMessage(extra.from, {
        text,
        mentions: [last.sender]
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`*❌ ERROR*\n\n_${error.message}_`);
    }
  }
};

function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

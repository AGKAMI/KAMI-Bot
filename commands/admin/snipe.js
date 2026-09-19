/**
 * Snipe Command — View deleted messages history
 * Supports: .snipe, .snipe 3, .snipe list
 */

const snipeStore = require('../../utils/snipeStore');
const { bold, pick, SLANG } = require('../../utils/format');
const SnipeStoreClass = snipeStore.constructor;
const typeEmoji = SnipeStoreClass.typeEmoji;

module.exports = {
  name: 'snipe',
  aliases: ['deleted', 'lastdel'],
  category: 'admin',
  description: 'See deleted messages history',
  usage: '.snipe | .snipe <number> | .snipe list',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || '').toLowerCase();

      // --- .snipe list — show all stored deleted messages ---
      if (sub === 'list') {
        return this.showList(msg, args, extra);
      }

      // --- .snipe [n] — show nth most recent ---
      const index = parseInt(sub, 10);
      const targetIndex = isNaN(index) ? 0 : Math.max(0, index - 1);

      const entry = snipeStore.get(extra.from, targetIndex);

      if (!entry) {
        const total = snipeStore.list(extra.from).length;
        if (total === 0) {
          return extra.reply(
            `❌ *NO DELETED MESSAGES*\n\n` +
            `_No deleted messages stored for this group ${pick(SLANG.vibe)}_\n\n` +
            `_Make sure antidelete is active_`
          );
        }
        return extra.reply(
          `❌ *OUT OF RANGE*\n\n` +
          `_Only ${total} deleted message${total === 1 ? '' : 's'} stored ${pick(SLANG.vibe)}_`
        );
      }

      return this.showEntry(msg, entry, extra.from, targetIndex + 1, extra);

    } catch (error) {
      await extra.reply(`❌ *ERROR*\n\n_${error.message}_`);
    }
  },

  async showList(msg, args, extra) {
    const entries = snipeStore.list(extra.from);

    if (entries.length === 0) {
      return extra.reply(
        `❌ *NO DELETED MESSAGES*\n\n` +
        `_No deleted messages stored for this group ${pick(SLANG.vibe)}_`
      );
    }

    let text = `📜 *DELETED MESSAGES*\n`;
    text += `_Showing ${entries.length} stored message${entries.length === 1 ? '' : 's'}_\n`;
    text += `----------\n`;

    entries.forEach((entry, i) => {
      const emoji = typeEmoji(entry.type);
      const timeAgo = getTimeAgo(entry.time);
      const preview = entry.content
        ? entry.content.substring(0, 40) + (entry.content.length > 40 ? '...' : '')
        : `_${emoji} ${entry.type}_`;
      text += `\n${emoji} *#${i + 1}* — ${preview}\n`;
      text += `   👤 @${entry.sender.split('@')[0]} | ⏰ ${timeAgo}\n`;
    });

    text += `----------\n`;
    text += `_Use .snipe <number> for details ${pick(SLANG.vibe)}_`;

    const mentions = entries.map(e => e.sender);

    await sock.sendMessage(extra.from, {
      text,
      mentions
    }, { quoted: msg });
  },

  async showEntry(msg, entry, from, number, extra) {
    const timeAgo = getTimeAgo(entry.time);
    const senderNum = entry.sender.split('@')[0];
    const emoji = typeEmoji(entry.type);
    const date = new Date(entry.time).toLocaleString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let text = `${emoji} *SNIPE #${number}*\n\n`;
    text += `👤 *Deleted by:* @${entry.deletedBy.split('@')[0]}\n`;
    text += `👤 *Original sender:* @${senderNum}\n`;
    text += `💬 *Message:* ${entry.content || `_${emoji} ${entry.type}_`}\n`;
    text += `🏷️ *Type:* ${entry.type}\n`;
    text += `⏰ *When:* ${date} (${timeAgo})\n`;

    await sock.sendMessage(from, {
      text,
      mentions: [entry.sender, entry.deletedBy]
    }, { quoted: msg });
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

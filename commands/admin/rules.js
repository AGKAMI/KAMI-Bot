/**
 * Rules Command — View, set, and clear group rules
 * Supports template variables: {group}, {count}, {time}
 * Auto-numbers rules on display
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, voice } = require('../../utils/format');
const prefix = config.prefix || '.';

module.exports = {
  name: 'rules',
  reactions: { received: '📜', done: '📖' },
  aliases: ['grouprules', 'grouprule'],
  category: 'admin',
  description: 'View, set or clear the group rules',
  usage: '.rules | .setrules <text> | .clearrules',
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      const sub = (args[0] || '').toLowerCase();

      // --- .rules — view rules (anyone can) ---
      if (!sub || (sub !== 'set' && sub !== 'clear')) {
        return this.showRules(msg, args, extra);
      }

      // --- .clearrules — admin only ---
      if (sub === 'clear') {
        return this.clearRules(msg, args, extra);
      }

      // --- .setrules <text> — admin only ---
      if (sub === 'set') {
        return this.setRules(msg, args, extra);
      }

    } catch (error) {
      extra.fail();
      await extra.reply(`❌ *ERROR*\n\n_${error.message}_`);
    }
  },

  async showRules(msg, args, extra) {
    const settings = database.getGroupSettings(extra.from);
    const rules = settings.rules;

    if (!rules) {
      return extra.reply(
        `📜 *GROUP RULES*\n\n` +
        `_No rules set yet, ${voice.tag('err')}_\n\n` +
        `*How to set rules:*\n` +
        `Admins, use: ${prefix}setrules No spam; Be respectful; Have fun\n` +
        `_Use semicolons or new lines between rules_`
      );
    }

    const groupName = extra.groupMetadata?.subject || 'This Group';
    const memberCount = extra.groupMetadata?.participants?.length || 0;
    const now = new Date().toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Process template variables
    let processedRules = rules
      .replace(/\{group\}/g, groupName)
      .replace(/\{count\}/g, memberCount)
      .replace(/\{time\}/g, now);

    // Auto-number: split by \n or ; and number each line
    const lines = processedRules
      .split(/[;\n]/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    let numbered = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');

    return extra.reply(
      `📜 *GROUP RULES*\n` +
      `👤 ${bold(groupName)}\n` +
      `----------\n` +
      `${numbered}\n` +
      `----------\n\n` +
      `_${voice.lead('affirm')}, follow these hey!_`
    );
  },

  async setRules(msg, args, extra) {
    const senderId = extra.sender || msg.key.participant || msg.key.remoteJid;
    const groupMeta = extra.groupMetadata;
    const senderMeta = groupMeta.participants.find(
      p => (p.id === senderId || p.lid === senderId)
    );

    if (!senderMeta || !senderMeta.admin) {
      return extra.reply(
        `🛡️ *ADMINS ONLY*\n\n` +
        `_You need admin to set rules_`
      );
    }

    const text = args.slice(1).join(' ').trim();
    if (!text) {
      extra.fail();
      return extra.reply(
        `❌ *ERROR*\n\n` +
        `_Provide the rules text_\n\n` +
        `*Example:*\n` +
        `${prefix}setrules No spam; Be respectful; Have fun\n\n` +
        `_Use ; or new lines between rules_`
      );
    }

    database.updateGroupSettings(extra.from, { rules: text });

    const groupName = extra.groupMetadata?.subject || 'this group';

    return extra.reply(
      `✅ *RULES SET*\n\n` +
      `📜 ${bold(groupName)} rules updated!\n\n` +
      `_Admin, rules saved!_`
    );
  },

  async clearRules(msg, args, extra) {
    const senderId = extra.sender || msg.key.participant || msg.key.remoteJid;
    const groupMeta = extra.groupMetadata;
    const senderMeta = groupMeta.participants.find(
      p => (p.id === senderId || p.lid === senderId)
    );

    if (!senderMeta || !senderMeta.admin) {
      return extra.reply(
        `🛡️ *ADMINS ONLY*\n\n` +
        `_You need admin to clear rules_`
      );
    }

    database.updateGroupSettings(extra.from, { rules: '' });

    return extra.reply(
      `✅ *RULES CLEARED*\n\n` +
      `_Rules wiped, ${voice.tag('neutral')}, this group has no rules now_`
    );
  }
};

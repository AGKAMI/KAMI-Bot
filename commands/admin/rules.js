/**
 * Rules Command - View or set group rules
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'rules',
  aliases: ['grouprules', 'grouprule'],
  category: 'admin',
  description: 'View or set group rules',
  usage: '.rules [set <text>]',
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || '').toLowerCase();

      // .rules — view rules (anyone can)
      if (!sub || sub !== 'set') {
        const settings = database.getGroupSettings(extra.from);
        const rules = settings.rules;

        if (!rules) {
          return extra.reply(
            `📜 *RULES*\n\n` +
            `_No rules set yet, ${pick(SLANG.vibe)}_\n\n` +
            `_Admins can set rules with: .setrules <text>_`
          );
        }

        return extra.reply(`📜 *GROUP RULES*\n\n${rules}`);
      }

      // .rules set <text> — admin only
      const senderId = extra.sender || msg.key.participant || msg.key.remoteJid;
      const groupMeta = extra.groupMetadata;
      const senderMeta = groupMeta.participants.find(
        p => (p.id === senderId || p.lid === senderId)
      );

      if (!senderMeta || !senderMeta.admin) {
        return extra.reply(
          `*🛡️ ADMINS ONLY*\n\n` +
          `_You need admin to set rules, ${pick(SLANG.friend)}_`
        );
      }

      const text = args.slice(1).join(' ').trim();
      if (!text) {
        return extra.reply(
          `❌ *ERROR*\n\n` +
          `_Provide the rules text, ${pick(SLANG.vibe)}_\n\n` +
          `_Example: .setrules No spam, be respectul, have fun_`
        );
      }

      database.updateGroupSettings(extra.from, { rules: text });

      return extra.reply(
        `✅ *RULES SET*\n\n` +
        `${text}\n\n` +
        `_${pick(SLANG.good)}, rules updated!_`
      );

    } catch (error) {
      await extra.reply(`*❌ ERROR*\n\n_${error.message}_`);
    }
  }
};

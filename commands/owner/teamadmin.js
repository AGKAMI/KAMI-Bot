/**
 * Team Admin Command — manage SS team group admins.
 * Separate from .approve / DM blocker. Grants team admins DM access to ONLY
 * .crew accept / .crew deny so they can review applications from their DMs.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG } = require('../../utils/format');

function phoneToJid(phone) {
  if (!phone) return null;
  if (phone.includes('@s.whatsapp.net')) return phone;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = '27' + digits.slice(1);
  }
  if (digits.length < 10) return null;
  return digits + '@s.whatsapp.net';
}

module.exports = {
  name: 'teamadmin',
  aliases: ['ta', 'teamadminapprove'],
  category: 'owner',
  description: 'Manage SS team admins (approve/remove/list)',
  usage: '.teamadmin approve|remove|list <number|@mention>',
  ownerOnly: true,

  async execute(sock, msg, args) {

  const prefix = config.prefix || '.';
    try {
      const sub = (args[0] || '').toLowerCase();

      if (sub === 'list') {
        const admins = database.getTeamAdmins();
        const list = admins.length ? admins.map(n => `  • ${n}`).join('\n') : '  _None_';
        return sock.sendMessage(msg.key.remoteJid, {
          text: `👥 *TEAM ADMINS*\n\n_These can accept/deny applications from DMs:_\n${list}\n\n*Usage:*\n  ${prefix}teamadmin approve <number>\n  ${prefix}teamadmin remove <number>\n  ${prefix}teamadmin list`
        }, { quoted: msg });
      }

      if (sub === 'approve' || sub === 'remove') {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        let target = mentioned.length > 0 ? mentioned[0] : null;
        let num = null;

        if (!target && args[1]) {
          target = phoneToJid(args[1]);
          num = target ? target.split('@')[0] : null;
        }

        if (!target) {
          return sock.sendMessage(msg.key.remoteJid, {
            text: `❌ ERROR\n\n_Usage: ${prefix}teamadmin ${sub} <number|@mention>_`
          }, { quoted: msg });
        }

        const digits = (num || target.split('@')[0]);

        if (sub === 'approve') {
          const added = database.addTeamAdmin(digits);
          await sock.sendMessage(msg.key.remoteJid, {
            text: added
              ? `✅ *TEAM ADMIN ADDED*\n\n_${digits} can now accept/deny applications from DMs._`
              : `⚠️ *ALREADY A TEAM ADMIN*\n\n_${digits} is already approved._`
          }, { quoted: msg });
        } else {
          const removed = database.removeTeamAdmin(digits);
          await sock.sendMessage(msg.key.remoteJid, {
            text: removed
              ? `❌ *TEAM ADMIN REMOVED*\n\n_${digits} lost DM accept/deny access._`
              : `⚠️ *NOT FOUND*\n\n_${digits} wasn't a team admin._`
          }, { quoted: msg });
        }
        return;
      }

      return sock.sendMessage(msg.key.remoteJid, {
        text: `❌ *ERROR*\n\n_Invalid option_\n\n*Usage:*\n  ${prefix}teamadmin approve <number>\n  ${prefix}teamadmin remove <number>\n  ${prefix}teamadmin list`
      }, { quoted: msg });

    } catch (error) {
      console.error('Team Admin Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ *ERROR*\n\n_${pick(SLANG.error)} — ${error.message}_`
      }, { quoted: msg });
    }
  }
};
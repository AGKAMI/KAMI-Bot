/**
 * Approve Command - Shortcut for .dmblocker approve
 * Accepts any number format: 083 388 2383 / +27 83 388 2383 / 27833882383.
 * Stores the canonical digits, unblocks on WhatsApp, lifts a bot ban if any,
 * and DMs the welcome message — DM/unblock failures are reported, never silent.
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, voice } = require('../../utils/format');
const { updateBlockStatusSafe } = require('../../utils/jidHelper');

const parseNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = (config.defaultCountryCode || '27') + digits.slice(1);
  return digits;
};

module.exports = {
  name: 'approve',
  reactions: { received: '👍', done: '✅' },
  aliases: [],
  category: 'owner',
  description: 'Approve a number past the DM blocker',
  usage: '.approve <number — any format>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    const number = (args || []).join(' ').trim();
    if (!number || !/\d/.test(number)) {
      extra.fail();
      return extra.reply(
        `*Usage:* ${prefix}approve <number>\n\n_Any format:_\n` +
        `• ${prefix}approve 083 388 2383\n` +
        `• ${prefix}approve +27 83 388 2383\n` +
        `• ${prefix}approve 27833882383`
      );
    }

    try {
      const digits = parseNumber(number);
      if (!digits) { extra.fail(); return extra.reply(`❌ ERROR\n\n_Invalid number_`); }
      const targetJid = digits + '@s.whatsapp.net';

      // Add to approved list — canonical digits (database canonicalizes too)
      const added = database.addApprovedNumber(digits);

      // WhatsApp-unblock — tries PN/LID variants. We can't read the block list,
      // so we only report real failures instead of always claiming "UNBLOCKED".
      let unblockErr = '';
      try {
        await updateBlockStatusSafe(sock, targetJid, 'unblock');
      } catch (e) {
        unblockErr = e.message || 'unknown error';
        console.error(`[APPROVE] unblock failed for ${digits}:`, unblockErr);
      }

      // Unban if banned
      let wasBanned = false;
      try {
        const user = database.getUser(targetJid);
        if (user && user.banned) {
          database.updateUser(targetJid, { banned: false, bannedIn: null });
          wasBanned = true;
        }
      } catch (e) {
        console.error('[APPROVE] ban check failed:', e.message);
      }

      // DM them the approval message — failure is captured, logged and SHOWN
      let dmErr = '';
      try {
        await sock.sendMessage(targetJid, {
          text: `🎉 *WELCOME TO KAMI BOT* 🤖\n\n` +
                `✅ You're *approved* by KAMI\n` +
                `🔓 You can message this bot directly now\n\n` +
                `Send *${prefix}menu* for everything I can do\n` +
                `Type *${prefix}help* if you get stuck\n\n` +
                `_Lekke, enjoy the bot!_ 💀`
        });
      } catch (e) {
        dmErr = e.message || 'unknown error';
        console.error(`[APPROVE] welcome DM failed for ${digits}:`, dmErr);
      }

      // Confirm in chat with details
      let reply = added
        ? `*✅ APPROVED*\n\n_${digits} can use the bot in DMs now._`
        : `*⚠️ ALREADY APPROVED*\n\n_${digits} is already approved._`;

      if (wasBanned) {
        reply += `\n\n🔨 *BAN LIFTED* — off the bot ban list`;
      }
      if (dmErr) {
        extra.fail();
        reply += `\n\n⚠️ *Welcome DM failed:* ${dmErr}` +
          (/not-authorized|forbidden|blocked/i.test(dmErr)
            ? `\n_They've most likely blocked the bot — approval is saved, but the welcome message can't reach them._`
            : `\n_Approval is saved — the welcome DM just couldn't be delivered._`);
      }
      if (unblockErr) {
        reply += `\n\n⚠️ *WhatsApp unblock failed:* ${unblockErr}`;
      }

      console.log(`[APPROVE] ${digits} added=${!!added} dm=${dmErr ? 'FAILED: ' + dmErr : 'sent'} unblock=${unblockErr ? 'FAILED: ' + unblockErr : 'ok'} bannedLifted=${wasBanned}`);
      await sock.sendMessage(extra.from, { text: reply }, { quoted: msg });
    } catch (error) {
      extra.fail();
      console.error('[APPROVE] error:', error);
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — couldn't approve that number`);
    }
  },
};

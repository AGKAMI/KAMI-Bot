/**
 * DM Blocker Command - Toggle private mode + approve numbers
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, voice } = require('../../utils/format');
const { updateBlockStatusSafe } = require('../../utils/jidHelper');

// Any phone format → canonical digits (083…, +27…, spaced, dashed)
const parseNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = (config.defaultCountryCode || '27') + digits.slice(1);
  return digits;
};

module.exports = {
  name: 'dmblocker',
  reactions: { received: '📭', done: '🚫' },
  aliases: ['dmblock', 'private', 'selfmode'],
  category: 'owner',
  description: 'Flip the DM blocker and manage approved numbers',
  usage: '.dmblocker on/off/status/approve <number>/disapprove <number>/list',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const action = args[0]?.toLowerCase();
      const chatId = msg.key.remoteJid;
      const globalSettings = database.getGlobalSettings();
      const currentStatus = globalSettings.selfMode ? 'ON' : 'OFF';

      if (!action || action === 'status') {
        const approved = database.getApprovedNumbers();
        const list = approved.length ? approved.map(n => `  • ${database.canonicalNumber(n) || n}`).join('\n') : '  _None_';
        return await sock.sendMessage(chatId, {
          text: `*🚫 DM BLOCKER*\n\n` +
               `*Status:* *${currentStatus}*\n\n` +
               `*Approved numbers:*\n${list}\n\n` +
               `*Usage:*\n` +
               `  ${prefix}dmblocker on/off\n` +
               `  ${prefix}dmblocker approve <number>\n` +
               `  ${prefix}dmblocker disapprove <number>\n` +
               `  ${prefix}dmblocker list`
        }, { quoted: msg });
      }

      if (action === 'on') {
        if (globalSettings.selfMode) {
          return await sock.sendMessage(chatId, {
            text: `*⚠️ ALREADY ON*\n\n_DM Blocker is already *ON*_`
          }, { quoted: msg });
        }
        database.updateGlobalSettings({ selfMode: true });
        return await sock.sendMessage(chatId, {
          text: `*✅ DM BLOCKER ON*\n\n` +
               `_${voice.lead('affirm')}, dm blocker is now on_\n\n` +
               `Only approved numbers can use this bot, shame.\n` +
               `Use ${prefix}dmblocker approve <number> to let someone in.`
        }, { quoted: msg });
      }

      if (action === 'off') {
        if (!globalSettings.selfMode) {
          return await sock.sendMessage(chatId, {
            text: `*⚠️ ALREADY OFF*\n\n_DM Blocker is already *OFF*_`
          }, { quoted: msg });
        }
        database.updateGlobalSettings({ selfMode: false });
        return await sock.sendMessage(chatId, {
          text: `*✅ DM BLOCKER OFF*\n\n` +
               `_${voice.lead('affirm')}, dm blocker is now off_\n\n` +
               `Anyone can use this bot now.`
        }, { quoted: msg });
      }

      if (action === 'approve') {
        const number = args.slice(1).join(' ').trim();
        if (!number || !/\d/.test(number)) {
          return await sock.sendMessage(chatId, {
            text: `*Usage:* ${prefix}dmblocker approve <number>\n\n_Any format:_ ${prefix}dmblocker approve 083 388 2383`
          }, { quoted: msg });
        }

        const digits = parseNumber(number);
        if (!digits) {
          extra.fail();
          return await sock.sendMessage(chatId, {
            text: `❌ ERROR\n\n_Invalid number_`
          }, { quoted: msg });
        }
        const targetJid = digits + '@s.whatsapp.net';

        // Add to approved list — canonical digits
        const added = database.addApprovedNumber(digits);

        // WhatsApp-unblock (PN/LID variants) — report real failures only
        let unblockErr = '';
        try { await updateBlockStatusSafe(sock, targetJid, 'unblock'); }
        catch (e) { unblockErr = e.message || 'unknown error'; console.error(`[DMBLOCKER] unblock failed for ${digits}:`, unblockErr); }

        // Unban if banned
        let wasBanned = false;
        try {
          const user = database.getUser(targetJid);
          if (user && user.banned) {
            database.updateUser(targetJid, { banned: false, bannedIn: null });
            wasBanned = true;
          }
        } catch (e) { console.error('[DMBLOCKER] ban check failed:', e.message); }

        // DM them the approval message — failures captured, logged and SHOWN
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
          console.error(`[DMBLOCKER] welcome DM failed for ${digits}:`, dmErr);
        }

        // Confirm in chat
        let reply = added
          ? `*✅ APPROVED*\n\n_${digits} can now use the bot._`
          : `*⚠️ ALREADY APPROVED*\n\n_${digits} is already approved._`;

        if (wasBanned) {
          reply += `\n\n🔨 *BAN LIFTED* — off the bot ban list`;
        }
        if (dmErr) {
          extra.fail();
          reply += `\n\n⚠️ *Welcome DM failed:* ${dmErr}` +
            (/not-authorized|forbidden|blocked/i.test(dmErr)
              ? `\n_They've most likely blocked the bot — approval is saved, but the welcome can't reach them._`
              : `\n_Approval is saved — the welcome DM just couldn't be delivered._`);
        }
        if (unblockErr) {
          reply += `\n\n⚠️ *WhatsApp unblock failed:* ${unblockErr}`;
        }

        console.log(`[DMBLOCKER] approve ${digits} added=${!!added} dm=${dmErr ? 'FAILED: ' + dmErr : 'sent'}`);
        return await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
      }

      if (action === 'disapprove') {
        const number = args.slice(1).join(' ').trim();
        if (!number || !/\d/.test(number)) {
          extra.fail();
          return await sock.sendMessage(chatId, {
            text: `*Usage:* ${prefix}dmblocker disapprove <number>\n\n_Any format:_ ${prefix}dmblocker disapprove 083 388 2383`
          }, { quoted: msg });
        }
        const digits = parseNumber(number);
        if (!digits) {
          extra.fail();
          return await sock.sendMessage(chatId, {
            text: `❌ ERROR\n\n_Invalid number_`
          }, { quoted: msg });
        }
        const removed = database.removeApprovedNumber(digits);
        if (!removed) extra.fail();
        return await sock.sendMessage(chatId, {
          text: removed
            ? `*❌ REMOVED*\n\n_${digits} can't use the bot anymore._`
            : `*⚠️ NOT FOUND*\n\n_${digits} wasn't on the approved list._`
        }, { quoted: msg });
      }

      if (action === 'list') {
        const approved = database.getApprovedNumbers();
        const list = approved.length
          ? approved.map(n => `  • ${database.canonicalNumber(n) || n}`).join('\n')
          : '  _No approved numbers yet_';
        return await sock.sendMessage(chatId, {
          text: `*📋 APPROVED NUMBERS*\n\n${list}`
        }, { quoted: msg });
      }

      extra.fail();
      return await sock.sendMessage(chatId, {
        text: `❌ ERROR\n\n_Invalid option_\n\n` +
             `*Usage:*\n` +
             `  ${prefix}dmblocker on/off/status\n` +
             `  ${prefix}dmblocker approve <number>\n` +
             `  ${prefix}dmblocker disapprove <number>\n` +
             `  ${prefix}dmblocker list`
      }, { quoted: msg });

    } catch (error) {
      console.error('DM Blocker Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `_${voice.openErr()} — ${error.message}_`
      }, { quoted: msg });
    }
  }
};

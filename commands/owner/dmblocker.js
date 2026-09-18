/**
 * DM Blocker Command - Toggle private mode + approve numbers
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'dmblocker',
  aliases: ['dmblock', 'private', 'selfmode'],
  category: 'owner',
  description: 'Toggle DM blocker and manage approved numbers',
  usage: '.dmblocker on/off/status/approve <number>/disapprove <number>/list',
  ownerOnly: true,

  async execute(sock, msg, args) {
    try {
      const action = args[0]?.toLowerCase();
      const chatId = msg.key.remoteJid;
      const globalSettings = database.getGlobalSettings();
      const currentStatus = globalSettings.selfMode ? 'ON' : 'OFF';

      if (!action || action === 'status') {
        const approved = database.getApprovedNumbers();
        const list = approved.length ? approved.map(n => `  • ${n}`).join('\n') : '  _None_';
        return await sock.sendMessage(chatId, {
          text: `${bold('🚫 DM BLOCKER')}\n\n` +
               `${bold('Status:')} *${currentStatus}*\n\n` +
               `${bold('Approved numbers:')}\n${list}\n\n` +
               `${bold('Usage:')}\n` +
               `  .dmblocker on/off\n` +
               `  .dmblocker approve <number>\n` +
               `  .dmblocker disapprove <number>\n` +
               `  .dmblocker list`
        }, { quoted: msg });
      }

      if (action === 'on') {
        if (globalSettings.selfMode) {
          return await sock.sendMessage(chatId, {
            text: `${bold('⚠️ ALREADY ON')}\n\n_DM Blocker is already *ON*, ${pick(SLANG.vibe)}_`
          }, { quoted: msg });
        }
        database.updateGlobalSettings({ selfMode: true });
        return await sock.sendMessage(chatId, {
          text: `${bold('✅ DM BLOCKER ON')}\n\n` +
               `_${pick(SLANG.good)}, dm blocker is now on_\n\n` +
               `Only approved numbers can use this bot.\n` +
               `Use .dmblocker approve <number> to add someone.`
        }, { quoted: msg });
      }

      if (action === 'off') {
        if (!globalSettings.selfMode) {
          return await sock.sendMessage(chatId, {
            text: `${bold('⚠️ ALREADY OFF')}\n\n_DM Blocker is already *OFF*, ${pick(SLANG.vibe)}_`
          }, { quoted: msg });
        }
        database.updateGlobalSettings({ selfMode: false });
        return await sock.sendMessage(chatId, {
          text: `${bold('✅ DM BLOCKER OFF')}\n\n` +
               `_${pick(SLANG.good)}, dm blocker is now off_\n\n` +
               `Anyone can now use this bot.`
        }, { quoted: msg });
      }

      if (action === 'approve') {
        const number = args[1];
        if (!number) {
          return await sock.sendMessage(chatId, {
            text: `${bold('Usage:')} .dmblocker approve <number>\n\n_Example: .dmblocker approve 27831234567_`
          }, { quoted: msg });
        }
        const added = database.addApprovedNumber(number);
        // Also WhatsApp-unblock them if they were blocked
        try {
          let digits = number.replace(/\D/g, '');
          if (digits.startsWith('0')) digits = '27' + digits.slice(1);
          await sock.updateBlockStatus(digits + '@s.whatsapp.net', 'unblock');
        } catch (e) {}
        return await sock.sendMessage(chatId, {
          text: added
            ? `${bold('✅ APPROVED')}\n\n_${number} can now use the bot._`
            : `${bold('⚠️ ALREADY APPROVED')}\n\n_${number} is already approved._`
        }, { quoted: msg });
      }

      if (action === 'disapprove') {
        const number = args[1];
        if (!number) {
          return await sock.sendMessage(chatId, {
            text: `${bold('Usage:')} .dmblocker disapprove <number>`
          }, { quoted: msg });
        }
        const removed = database.removeApprovedNumber(number);
        return await sock.sendMessage(chatId, {
          text: removed
            ? `${bold('❌ REMOVED')}\n\n_${number} can no longer use the bot._`
            : `${bold('⚠️ NOT FOUND')}\n\n_${number} wasn't in the approved list._`
        }, { quoted: msg });
      }

      if (action === 'list') {
        const approved = database.getApprovedNumbers();
        const list = approved.length
          ? approved.map(n => `  • ${n}`).join('\n')
          : '  _No approved numbers yet_';
        return await sock.sendMessage(chatId, {
          text: `${bold('📋 APPROVED NUMBERS')}\n\n${list}`
        }, { quoted: msg });
      }

      return await sock.sendMessage(chatId, {
        text: `${bold(pick(SLANG.error))} — invalid option\n\n` +
             `${bold('Usage:')}\n` +
             `  .dmblocker on/off/status\n` +
             `  .dmblocker approve <number>\n` +
             `  .dmblocker disapprove <number>\n` +
             `  .dmblocker list`
      }, { quoted: msg });

    } catch (error) {
      console.error('DM Blocker Error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `_${pick(SLANG.error)} — ${error.message}_`
      }, { quoted: msg });
    }
  }
};

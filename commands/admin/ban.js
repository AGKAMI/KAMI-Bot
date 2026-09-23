/**
 * Ban Command - Ban a user from using the bot (groups + DMs)
 * Sends ban message then WhatsApp-blocks them
 */

const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

const parseNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = (config.defaultCountryCode || '27') + digits.slice(1);
  return digits + '@s.whatsapp.net';
};

module.exports = {
  name: 'ban',
  aliases: [],
  category: 'admin',
  description: 'Ban a user from the bot',
  usage: '.ban @user/reply/number',
  adminOnly: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const { from, sender } = extra;
      let target;

      // Priority: @mention → reply → phone number
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        target = ctx.participant;
      } else {
        const rawArg = args.join(' ');
        if (rawArg && /\d/.test(rawArg)) {
          target = parseNumber(rawArg);
          if (!target) return extra.reply(`❌ ERROR\n\n_Invalid number_`);
        } else {
          return extra.reply(`❌ ERROR\n\n_Tag, reply, or add a number_\n\n_Example: ${prefix}ban 27833882383_`);
        }
      }

      const targetNum = target.split('@')[0].replace(/:/g, '');
      const ownerNums = (config.ownerNumber || []).map(n => n.replace(/\D/g, ''));
      if (ownerNums.includes(targetNum)) {
        return extra.reply(`❌ ERROR\n\n_Can't ban the owner_`);
      }
      if (target === sender) {
        return extra.reply(`❌ ERROR\n\n_Can't ban yourself_`);
      }

      // Send ban message first (before block so it delivers)
      await sock.sendMessage(from, {
        text:
          `🚫 BANNED FROM KAMI BOT\n\n` +
          `${mention(target)} has been permanently banned from this bot\n\n` +
          `_For ban appeals, contact the bot owner directly._`,
        mentions: [target]
      });

      // WhatsApp-block them
      try {
        await sock.updateBlockStatus(target, 'block');
      } catch (e) {
        console.error('[BAN] block failed:', e.message);
      }

      // Confirm in chat
      await sendButtons(sock, from, {
        text:
          `✅ SUCCESS\n\n` +
          `🔨 BANNED\n\n` +
          `${mention(target)} has been banned\n\n` +
          `_${pick(SLANG.vibe)}_`,
        mentions: [target],
        footer: 'Ban Management',
        buttons: [
          { id: `admin:unban:${target.split(':')[0]}`, text: '♻️ Unban User' },
        ],
      }, { quoted: msg });

    } catch (error) {
      await extra.reply(`❌ ERROR\n\n_${error.message}_`);
    }
  }
};

// Button handlers
onButton('admin:unban', async (sock, msg, from, sender, btnId) => {
  const target = btnId.replace('admin:unban:', '');
  if (!target) return;

  // Permission check — only group admins or owner can unban
  try {
    const meta = await sock.groupMetadata(from).catch(() => null);
    if (meta && meta.participants) {
      const clickerIsAdmin = meta.participants.some(
        p => (p.id === sender || p.lid === sender) && (p.admin === 'admin' || p.admin === 'superadmin')
      );
      const config = require('../../config');
      const clickerIsOwner = (config.ownerNumber || []).some(n => sender.includes(n));
      if (!clickerIsAdmin && !clickerIsOwner) {
        return await sock.sendMessage(from, {
          text: `❌ *ADMIN ONLY*\n\nOnly group admins can unban members.`,
          mentions: [sender],
        });
      }
    }
  } catch (e) {
    console.error('[UNBAN BTN] permission check failed:', e.message);
  }

  try {
    await sock.updateBlockStatus(target, 'unblock');
    await sock.sendMessage(from, {
      text:
        `✅ SUCCESS\n\n` +
        `♻️ UNBANNED\n\n` +
        `${mention(target)} has been unbanned\n\n` +
        `_${pick(SLANG.vibe)}_`,
      mentions: [target],
    });
  } catch (e) {
    console.error('[UNBAN BTN] Error:', e.message);
    await sock.sendMessage(from, {
      text:
        `❌ ERROR\n\n` +
        `Couldn't unban — ${e.message || 'Unknown error'}`,
    });
  }
});

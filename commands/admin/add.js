/**
 * Add Command — add a user (any phone number format) to this WhatsApp group.
 * On privacy-blocked adds: shows the fail in the group + DMs the person the
 * group invite link with the group's profile picture attached.
 * Usage: .add <number>
 */

const config = require('../../config');
const axios = require('axios');
const { pick, SLANG, mention, voice } = require('../../utils/format');
const { sendButtons } = require('../../utils/buttonHelper');

function phoneToJid(phone) {
  if (!phone) return null;
  if (phone.includes('@s.whatsapp.net')) return phone;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = (config.defaultCountryCode || '27') + digits.slice(1);
  }
  if (digits.length < 10) return null;
  return digits + '@s.whatsapp.net';
}

module.exports = {
  name: 'add',
  reactions: { received: '🆕', done: '🟢' },
  category: 'admin',
  description: 'Add a number to the group',
  usage: '.add <number>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      if (!args || args.length === 0) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nGive me a number\n\nUsage: ${prefix}add <number>\n\n` +
          `Examples:\n` +
          `• ${prefix}add 0833882383\n` +
          `• ${prefix}add +27 83 388 2383\n` +
          `• ${prefix}add 27833882383`
        );
      }

      // Collect all phone-like args (handles split formats like +27 83 388 2383)
      const phoneParts = [];
      for (const arg of args) {
        if (/^[\d+\s()-]+$/.test(arg)) {
          phoneParts.push(arg);
        } else {
          break;
        }
      }
      const fullPhone = phoneParts.join(' ');
      const target = phoneToJid(fullPhone);

      if (!target) {
        extra.fail();
        return extra.reply(`❌ ERROR\n\nThat phone number looks off: ${fullPhone}`);
      }

      // Try the add with JID variants (privacy/locked users get rejected on exact JIDs sometimes)
      const { buildComparableIds, normalizeJidWithLid } = require('../../utils/jidHelper');
      const candidateJids = [];
      const stripped = target.replace(/:\d+@/, '@');
      if (stripped !== target) candidateJids.push(stripped);
      const resolvedJid = normalizeJidWithLid(target);
      if (resolvedJid && resolvedJid !== target && resolvedJid !== stripped) candidateJids.push(resolvedJid);
      for (const v of buildComparableIds(target)) {
        if (!candidateJids.includes(v)) candidateJids.push(v);
      }
      candidateJids.push(target);

      let added = false;
      for (const jid of candidateJids) {
        try {
          await sock.groupParticipantsUpdate(extra.from, [jid], 'add');
          added = true;
          break;
        } catch (e) {}
      }

      if (added) {
        await sock.sendMessage(extra.from, {
          text: `✅ SUCCESS\n\n➕ ADDED\n\n${mention(target)} is in the group now`,
          mentions: [target],
        }, { quoted: msg });
        return;
      }

      // FAILED — their privacy settings block the add.
      // Group message (Pattern A), then DM them the invite + the group's profile picture.
      extra.fail();
      await sock.sendMessage(extra.from, {
        text:
          `❌ ERROR\n\n` +
          `Couldn't add ${mention(target)} — their privacy settings block the add\n\n` +
          `I've DM'd them the group invite instead ${voice.tag('neutral')}`,
        mentions: [target],
      }, { quoted: msg });

      // Get the invite link + the group's profile picture for the DM
      let inviteLink = null;
      try {
        const code = await sock.groupInviteCode(extra.from);
        inviteLink = 'https://chat.whatsapp.com/' + code;
      } catch (e) {}

      const dmText = inviteLink
        ? `🔗 *KAMI tried adding you*\n\n` +
          `The add failed because of your privacy settings — here's the link to the group KAMI tried adding you to:\n\n` +
          `${inviteLink}\n\n` +
          `Tap it to join if you want in ${voice.tag('soften')}`
        : `🔗 *KAMI tried adding you*\n\n` +
          `The add failed because of your privacy settings — ask the admin who added you to send you the group link ${voice.tag('soften')}`;

      const dmButtons = inviteLink
        ? [
            { text: '🔗 Join the Group', url: inviteLink },
            { text: '📋 Copy Invite Link', displayText: inviteLink },
          ]
        : [];

      // Attach the group's profile picture to the DM
      try {
        let sent = false;
        try {
          const ppUrl = await sock.profilePictureUrl(extra.from, 'image');
          if (ppUrl) {
            const picRes = await axios.get(ppUrl, { responseType: 'arraybuffer' });
            await sendButtons(sock, target, {
              image: Buffer.from(picRes.data),
              caption: dmText,
              text: dmText,
              footer: config.botName || 'KAMI Bot',
              buttons: dmButtons,
            });
            sent = true;
          }
        } catch (ppErr) {
          console.error('[ADD] group pic fetch failed:', ppErr.message);
        }
        if (!sent) {
          if (dmButtons.length > 0) {
            await sendButtons(sock, target, {
              text: dmText,
              footer: config.botName || 'KAMI Bot',
              buttons: dmButtons,
            });
          } else {
            await sock.sendMessage(target, { text: dmText });
          }
        }
        console.log(`[ADD] privacy-fail invite DM sent to ${target.split('@')[0]}`);
      } catch (dmErr) {
        console.error('[ADD] invite DM failed:', dmErr.message);
      }

    } catch (error) {
      console.error('Add error:', error);
      extra.fail();
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — couldn't get them in, shame`);
    }
  },
};
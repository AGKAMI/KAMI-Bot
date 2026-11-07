/**
 * Add Command — add a user (any phone number format) to this WhatsApp group.
 * On privacy-blocked adds: shows the fail in the group + DMs the person the
 * group invite link with the group's profile picture attached.
 * Usage: .add <number>
 */

const config = require('../../config');
const database = require('../../database');
const axios = require('axios');
const { pick, SLANG, mention, voice } = require('../../utils/format');
const { sendButtons } = require('../../utils/buttonHelper');

function phoneToJid(phone) {
  if (!phone) return null;
  if (phone.includes('@s.whatsapp.net')) return phone;
  // Strip EVERYTHING that isn't a digit — handles +27 79 878 2885,
  // 083-388-2383, (083) 388 2383, +27 (83) 388-2383, etc.
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  // Local SA format: leading 0 → prepend country code, drop the 0
  if (digits.startsWith('0') && digits.length >= 9) {
    digits = (config.defaultCountryCode || '27') + digits.slice(1);
  }
  // Already international (starts with country code) — use as-is
  // Otherwise assume local without leading 0 — prepend country code
  if (!digits.startsWith(config.defaultCountryCode || '27') && digits.length >= 9) {
    digits = (config.defaultCountryCode || '27') + digits;
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

      // ── Ban check — owner-kicked members: only owner may re-add ──
      const isBannedTarget = [target, ...buildComparableIds(target)]
        .some(v => database.isBanned(extra.from, v));
      if (isBannedTarget && !extra.isOwner) {
        extra.fail();
        return extra.reply(
          `🚫 *NAH BRU* 💀\n\n` +
          `${mention(target)} was kicked by KAMI personally\n\n` +
          `Only KAMI can add them back, boet — don't even try ${voice.tag('tease')}`
        );
      }
      // Owner re-adding a banned member — lift the ban BEFORE the add so the
      // group-participants event doesn't race and kick them straight back out
      if (isBannedTarget && extra.isOwner) {
        for (const v of [target, ...buildComparableIds(target)]) {
          database.unbanMember(extra.from, v);
        }
      }

      const candidateJids = [];
      const stripped = target.replace(/:\d+@/, '@');
      if (stripped !== target) candidateJids.push(stripped);
      const resolvedJid = normalizeJidWithLid(target);
      if (resolvedJid && resolvedJid !== target && resolvedJid !== stripped) candidateJids.push(resolvedJid);
      for (const v of buildComparableIds(target)) {
        if (!candidateJids.includes(v)) candidateJids.push(v);
      }
      candidateJids.push(target);

      // Honest add — Baileys status codes: a 403 privacy return used to
      // count as success here (the "✅ ADDED" lie)
      const { groupAction } = require('../../utils/groupActions');
      const addOutcome = await groupAction(sock, extra.from, candidateJids, 'add');
      const added = addOutcome.ok;
      const alreadyIn = addOutcome.alreadyDone;

      if (added) {
        // Owner add — mark for kick protection (ban already lifted above if any)
        if (extra.isOwner) {
          database.addOwnerAddedMember(extra.from, target, extra.sender);
        }
        await sock.sendMessage(extra.from, {
          text:
            `${alreadyIn ? '⚠️ ALREADY IN' : '✅ SUCCESS'}\n\n➕ ${alreadyIn ? 'ALREADY IN THE GROUP' : 'ADDED'}\n\n${mention(target)} ${alreadyIn ? 'was already here — no add needed' : 'is in the group now'}\n\n` +
            (extra.isOwner
              ? `_Protected — only you can kick them, ${voice.tag('neutral')}_`
              : ''),
          mentions: [target],
        }, { quoted: msg });
        return;
      }

      // FAILED — report the ACTUAL reason, then offer an invite-link DM
      // as a fallback so the person can still join when direct add is
      // blocked by privacy, permissions, or any other refusal.
      extra.fail();
      const failCode = String(addOutcome.code || '');
      const failReason = addOutcome.error || 'unknown reason';

      // 404/406 — nobody home on WhatsApp; can't DM a number that isn't on WA
      if (failCode === '404' || failCode === '406') {
        return extra.reply(
          `❌ ERROR\n\n` +
          `${mention(target)} isn't on WhatsApp, hey — check the number ${voice.tag('neutral')}\n\n` +
          `_${failReason}_`
        );
      }
      // 425 — rate-limited; wait and retry
      if (failCode === '425') {
        return extra.reply(
          `❌ ERROR\n\n` +
          `WhatsApp is rate-limiting me — try again in a minute ${voice.tag('neutral')}\n\n` +
          `_${failReason}_`
        );
      }

      // Any other refusal (403 privacy-blocked, permissions, unknown):
      // report it, then DM them the group invite link as a fallback.
      await sock.sendMessage(extra.from, {
        text:
          `❌ ERROR\n\n` +
          `Couldn't add ${mention(target)} — WhatsApp refused${failCode ? ` (${failCode})` : ''}\n` +
          `_${failReason}_\n\n` +
          `I'll DM them the group invite link instead ${voice.tag('neutral')}`,
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
          `The direct add didn't go through — here's the group link to join manually:\n\n` +
          `${inviteLink}\n\n` +
          `Tap it to join if you want in ${voice.tag('soften')}`
        : `🔗 *KAMI tried adding you*\n\n` +
          `The direct add didn't go through — ask an admin to send you the group link ${voice.tag('soften')}`;

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
        console.log(`[ADD] invite DM sent to ${target.split('@')[0]}`);
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
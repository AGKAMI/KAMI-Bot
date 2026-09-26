/**
 * RemoveFrom Command — remove a user (any phone number format) from any of the
 * bot's groups, from anywhere (DM or group). Owner only.
 * Usage: !removefrom <number> <group>
 *   !removefrom 0833882383 SSRS
 *   !removefrom +27 83 388 2383 garage
 *   !removefrom SSRS       (while replying to someone's message)
 */

const config = require('../../config');
const database = require('../../database');
const { pick, SLANG, mention } = require('../../utils/format');

const EXTRA_GROUPS = {
  GENERAL:   { jid: '120363417242897528@g.us', name: 'SS Crew General' },
  TESTING:   { jid: '120363424309756901@g.us', name: 'Bot Testing' },
  GARAGE:    { jid: '120363404874858785@g.us', name: 'Exclusive Garage' },
  COMMUNITY: { jid: '120363418980604721@g.us', name: 'Community Announcements' },
};

const GROUPS = {};
for (const [abbrev, t] of Object.entries(config.crewTeams || {})) {
  GROUPS[abbrev.toUpperCase()] = { jid: t.jid, name: t.name };
}
Object.assign(GROUPS, EXTRA_GROUPS);

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

function resolveGroup(spec) {
  if (!spec) return null;
  const s = spec.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;

  for (const [abbrev, g] of Object.entries(GROUPS)) {
    if (abbrev.toLowerCase() === s) {
      return { abbrev, ...g };
    }
  }

  const matches = Object.entries(GROUPS)
    .filter(([, g]) => g.name.toLowerCase().replace(/\s+/g, '').includes(s))
    .map(([abbrev, g]) => ({ abbrev, ...g }));

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return { ambiguous: matches };
  return null;
}

function groupList() {
  return Object.entries(GROUPS)
    .map(([abbrev, g]) => `• ${abbrev} — ${g.name}`)
    .join('\n');
}

module.exports = {
  name: 'removefrom',
  reactions: { received: '➖', done: '🔴' },
  category: 'owner',
  description: 'Remove a number from any of the bot\'s groups, from anywhere',
  usage: '.removefrom <number> <group>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      let target = null;

      // Method 1: reply to someone's message
      if (ctx?.participant) {
        target = ctx.participant;
      }
      // Method 2: @mention
      else if (mentioned.length > 0) {
        target = mentioned[0];
      }
      // Method 3: phone number (any format, may be split across args)
      else if (args.length > 0 && /^[\d+\s()-]+$/.test(args[0])) {
        const phoneParts = [];
        let specIdx = 0;
        for (let i = 0; i < args.length; i++) {
          if (/^[\d+\s()-]+$/.test(args[i])) {
            phoneParts.push(args[i]);
            specIdx = i + 1;
          } else {
            break;
          }
        }
        const fullPhone = phoneParts.join(' ');
        target = phoneToJid(fullPhone);
        if (!target) {
          return extra.reply(`❌ ERROR\n\nInvalid phone number: ${fullPhone}`);
        }
        args = args.slice(specIdx);
      }

      if (!target) {
        return extra.reply(
          `❌ ERROR\n\nProvide a number, mention, or reply to a message\n\n` +
          `Usage:\n` +
          `\`${prefix}removefrom <number> <group>\`\n` +
          `\`${prefix}removefrom SSRS\` (while replying to a message)\n\n` +
          `Groups:\n${groupList()}`
        );
      }

      const groupSpec = (args || []).join(' ');
      const resolved = resolveGroup(groupSpec);

      if (groupSpec && resolved && resolved.ambiguous) {
        const list = resolved.ambiguous
          .map(g => `• ${g.abbrev} — ${g.name}`)
          .join('\n');
        return extra.reply(
          `❌ ERROR\n\nMultiple groups match "${groupSpec}":\n\n${list}\n\n` +
          `Be more specific`
        );
      }

      if (!resolved || !resolved.jid) {
        return extra.reply(
          `❌ ERROR\n\nUnknown group: ${groupSpec || '(none given)'}\n\n` +
          `Groups:\n${groupList()}`
        );
      }

      const groupJid = resolved.jid;
      const groupName = resolved.name || resolved.abbrev;

      // Check if target is actually in the group
      const { buildComparableIds } = require('../../utils/jidHelper');
      const targetVariants = buildComparableIds(target);
      let inGroup = false;
      try {
        const meta = await sock.groupMetadata(groupJid).catch(() => null);
        if (meta && meta.participants) {
          inGroup = meta.participants.some(p => targetVariants.includes(p.id) || p.lid === target);
        }
      } catch (e) {}

      if (!inGroup) {
        return extra.reply(
          `❌ ERROR\n\n${mention(target)} is not in ${groupName}`
        );
      }

      // Mark as bot-initiated so handler.js protection doesn't re-add them (prevents loop)
      const handler = require('../../handler');
      for (const v of [...targetVariants, target]) handler._botKicked.add(v);
      setTimeout(() => {
        for (const v of [...targetVariants, target]) handler._botKicked.delete(v);
      }, 5000);

      // Remove with device-suffix + LID fallback
      let removeFailed = false;
      let lastError = null;
      const candidateJids = [];
      const stripped = target.replace(/:\d+@/, '@');
      if (stripped !== target) candidateJids.push(stripped);
      const resolvedJid = normalizeJidWithLidSafe(target);
      if (resolvedJid && resolvedJid !== target && resolvedJid !== stripped) candidateJids.push(resolvedJid);
      for (const v of targetVariants) {
        if (!candidateJids.includes(v)) candidateJids.push(v);
      }
      candidateJids.push(target);

      for (const jid of candidateJids) {
        try {
          await sock.groupParticipantsUpdate(groupJid, [jid], 'remove');
          removeFailed = false;
          break;
        } catch (e) {
          removeFailed = true;
          lastError = e;
        }
      }

      if (removeFailed) {
        const reason = lastError?.message || 'all JID variants rejected';
        console.error('[REMOVEFROM] WhatsApp remove failed:', reason);
        return extra.reply(
          `❌ ERROR\n\nCouldn't remove from ${groupName}\n\n` +
          `Make sure the bot is admin there\n\n` +
          `_${reason}_`
        );
      }

      // Clear protection entries — the owner deliberately removed them,
      // so the bot must not re-add them later
      database.removeOwnerAddedMember(groupJid, target);
      database.removeOwnerPromotedAdmin(groupJid, target);

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n➖ REMOVED FROM ${groupName.toUpperCase()}\n\n` +
          `${mention(target)} has been removed from ${groupName}\n\n` +
          `_${pick(SLANG.vibe)}_`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('RemoveFrom error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't remove them`);
    }
  },
};

function normalizeJidWithLidSafe(jid) {
  try {
    const { normalizeJidWithLid } = require('../../utils/jidHelper');
    return normalizeJidWithLid(jid);
  } catch (e) {
    return null;
  }
}

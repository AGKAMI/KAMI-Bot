/**
 * AddTo Command — add a user (any phone number format) to any of the bot's groups,
 * from anywhere (DM or group). Owner only.
 * Usage: !addto <number> <group>
 *   !addto 0833882383 SSRS
 *   !addto +27 83 388 2383 garage
 *   !addto SSRS            (while replying to someone's message)
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
  name: 'addto',
  reactions: { received: '➕', done: '🟢' },
  category: 'owner',
  description: 'Add a number to any of the bot\'s groups, from anywhere',
  usage: '.addto <number> <group>',
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
          `\`${prefix}addto <number> <group>\`\n` +
          `\`${prefix}addto SSRS\` (while replying to a message)\n\n` +
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

      // Check if target is already in the group
      try {
        const meta = await sock.groupMetadata(groupJid).catch(() => null);
        if (meta && meta.participants) {
          const { buildComparableIds } = require('../../utils/jidHelper');
          const targetVariants = buildComparableIds(target);
          const alreadyIn = meta.participants.some(p => targetVariants.includes(p.id) || p.lid === target);
          if (alreadyIn) {
            return extra.reply(
              `❌ ERROR\n\n${mention(target)} is already in ${groupName}`
            );
          }
        }
      } catch (e) {}

      // Add with device-suffix + LID fallback
      let groupAddFailed = false;
      let lastError = null;
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

      for (const jid of candidateJids) {
        try {
          await sock.groupParticipantsUpdate(groupJid, [jid], 'add');
          groupAddFailed = false;
          break;
        } catch (e) {
          groupAddFailed = true;
          lastError = e;
        }
      }

      if (groupAddFailed) {
        const reason = lastError?.message || 'all JID variants rejected';
        console.error('[ADDTO] WhatsApp add failed:', reason);
        return extra.reply(
          `❌ ERROR\n\nCouldn't add to ${groupName}\n\n` +
          `Make sure the bot is admin there and the number is on WhatsApp\n\n` +
          `_${reason}_`
        );
      }

      // Track owner-added members for protection (auto re-add if kicked)
      if (extra.isOwner) {
        database.addOwnerAddedMember(groupJid, target, extra.sender);
      }

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n➕ ADDED TO ${groupName.toUpperCase()}\n\n` +
          `${mention(target)} has been added to ${groupName}\n\n` +
          `_${pick(SLANG.vibe)}_`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('AddTo error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't add them`);
    }
  },
};

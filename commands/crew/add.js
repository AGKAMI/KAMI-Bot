/**
 * Crew Add Command — Add member to Slammed Society roster + WhatsApp group
 * Supports: @mention OR phone number
 */

const database = require('../../database');
const config = require('../../config');
const { bold, pick, SLANG, mention, voice } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');
const { fmtDate } = require('../../utils/sast');

const getRoleEmoji = (role, roles) => {
  const idx = roles.indexOf(role);
  if (idx === roles.length - 1) return '👑';
  if (idx === roles.length - 2) return '⭐';
  if (idx === 0) return '👤';
  return '🎖️';
};

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
  subName: 'add',
  name: null,
  aliases: ['join'],
  category: 'crew',
  description: 'Add a member to the crew roster and the WhatsApp group',
  usage: '.crew add @user|number [role]',
  groupOnly: false,
  ownerOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      let target = null;

      // Method 1: Reply to someone's message
      if (ctx?.participant) {
        target = ctx.participant;
      }
      // Method 2: @mention
      else if (mentioned.length > 0) {
        target = mentioned[0];
      }
      // Method 3: phone number (may be split across multiple args like +27 64 841 5504)
      else if (args.length > 0 && /^[\d+\s()-]+$/.test(args[0])) {
        // Collect all phone-like args (digits, +, spaces, dashes, brackets)
        let phoneParts = [];
        let roleIdx = 0;
        for (let i = 0; i < args.length; i++) {
          if (/^[\d+\s()-]+$/.test(args[i])) {
            phoneParts.push(args[i]);
            roleIdx = i + 1;
          } else {
            break;
          }
        }
        const fullPhone = phoneParts.join(' ');
        target = phoneToJid(fullPhone);
        if (!target) {
          return extra.reply(`❌ ERROR\n\nThat phone number looks proper off: ${fullPhone}`);
        }
        args = args.slice(roleIdx);
      }

      if (!target) {
        return extra.reply(
          `❌ ERROR\n\nTag someone or drop a number\n\n` +
          `Usage:\n` +
          `\`${prefix}crew add @user <role>\`\n` +
          `\`${prefix}crew add 0833882383 <role>\``
        );
      }

      const validRoles = database.getCustomRoles(extra.from);

      // Check if already in crew DB
      const existing = database.getCrewMember(extra.from, target);
      if (existing) {
        return extra.reply(
          `❌ ERROR\n\n${mention(target)} is already in the crew, hey\n` +
          `Role: ${getRoleEmoji(existing.role, validRoles)} ${existing.role}`
        );
      }

      // Parse role — find a valid role word from remaining args
      let role = validRoles[0]; // default to first (lowest) role
      for (const arg of args) {
        const lower = arg.toLowerCase();
        if (validRoles.includes(lower)) {
          role = lower;
          break;
        }
      }

      // Add to WhatsApp group first (with device-suffix + LID fallback).
      // Honest outcome: Baileys returns per-participant status codes —
      // 200 ok, 408 already-in, 403 privacy-blocked — and the old code
      // counted a 403 return as success.
      const { buildComparableIds, normalizeJidWithLid } = require('../../utils/jidHelper');
      const { groupAction } = require('../../utils/groupActions');
      const candidateJids = [];
      // Strip device suffix
      const stripped = target.replace(/:\d+@/, '@');
      if (stripped !== target) candidateJids.push(stripped);
      // LID → PN mapping
      const resolved = normalizeJidWithLid(target);
      if (resolved && resolved !== target && resolved !== stripped) candidateJids.push(resolved);
      // buildComparableIds variants
      for (const v of buildComparableIds(target)) {
        if (!candidateJids.includes(v)) candidateJids.push(v);
      }
      candidateJids.push(target);

      const addOutcome = await groupAction(sock, extra.from, candidateJids, 'add');
      const groupAddFailed = !addOutcome.ok;
      if (groupAddFailed) {
        console.error(`[CREW ADD] WhatsApp add failed — ${addOutcome.error || 'all JID variants rejected'}`);
      }

      // Save to database
      database.addCrewMember(extra.from, target, {
        role,
        joined: Date.now(),
        addedBy: extra.sender,
      });

      // Join-gate ledger — !crew add is a bot-sanctioned add (the bot
      // performs the groupParticipantsUpdate, but ledger it explicitly
      // in case the participants event is missed). Only ledger when the
      // add ACTUALLY landed — a failed add must not vouch for a stranger.
      if (addOutcome.ok) {
        try {
          require('../../utils/joinGate').markBotAdded(extra.from, target, 'crew-add', extra.sender);
        } catch (e) {}
      }

      // Track owner-added members for protection
      if (extra.isOwner) {
        const { buildComparableIds } = require('../../utils/jidHelper');
        for (const v of [target, ...buildComparableIds(target)]) {
          database.unbanMember(extra.from, v);
        }
        database.addOwnerAddedMember(extra.from, target, extra.sender);
      }

      const roleEmoji = getRoleEmoji(role, validRoles);
      const ownerVIP = extra.isOwnerMentioned;
      const alreadyIn = addOutcome.alreadyDone;

      // Honest verdict — the group-add either went through or it didn't;
      // the roster write is real either way, but the copy says which
      const verdictIcon = groupAddFailed ? '⚠️' : '✅';
      const headline = ownerVIP
        ? `👑 THE BOSS HAS SPOKEN 👑`
        : groupAddFailed
          ? `📝 ON THE ROSTER — GROUP ADD FAILED`
          : alreadyIn
            ? `👤 ALREADY IN THE GROUP — ROSTER UPDATED`
            : `👤 MEMBER ADDED`;

      await sock.sendMessage(extra.from, {
        text:
          `${verdictIcon} ${groupAddFailed ? 'PARTIAL' : 'SUCCESS'}\n\n` +
          `${headline}\n\n` +
          `${roleEmoji} ${mention(target)}\n\n` +
          `🏷️ Role: ${bold(role)}\n` +
          `📅 Joined: ${fmtDate(Date.now())}\n\n` +
          (ownerVIP
            ? `_The owner personally added this one. Show respect._ 👑`
            : groupAddFailed
              ? `_On the crew roster now — but I could NOT get them into the WhatsApp group_ ` +
                `(${addOutcome.error || 'privacy settings, or I\'m not admin'}).\n` +
                `💡 _Send them the invite link manually, or check my admin status_`
            : alreadyIn
              ? `_Was already in the group — crew roster updated_`
              : `_Added to group + crew roster_`),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew add error:', error);
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — couldn't get them in, shame`);
    }
  },
};

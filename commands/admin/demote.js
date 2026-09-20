/**
 * Demote Command — Demote someone from WhatsApp group admin
 *
 * Protection system:
 * - If the target was promoted by the owner, only the owner can demote them
 * - 1st unauthorized demotion attempt → warning + auto re-promote
 * - 2nd attempt → demote the violator + re-promote the protected admin
 * - If the owner demotes → allowed, protection removed
 */

const database = require('../../database');
const handler = require('../../handler');
const { pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'demote',
  category: 'admin',
  description: 'Demote admin to regular member',
  usage: '.demote @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const replyJid = ctx?.participant;

      let target = null;

      // Method 1: Reply
      if (replyJid) {
        target = replyJid;
      }
      // Method 2: @mention
      else if (mentioned.length > 0) {
        target = mentioned[0];
      }

      if (!target) {
        return extra.reply(
          `❌ ERROR\n\nTag or reply to someone\n\n` +
          `Usage:\n` +
          `• .demote @user\n` +
          `• Reply with .demote`
        );
      }

      const targetNum = target.split('@')[0];

      // ── Owner-Promoted Admin Protection ────────────────────
      const isProtected = database.isOwnerPromotedAdmin(extra.from, target);

      if (isProtected) {
        // Owner can always demote — remove protection and proceed
        if (extra.isOwner) {
          database.removeOwnerPromotedAdmin(extra.from, target);
          // Fall through to normal demote below
        } else {
          // Someone other than owner is trying to demote a protected admin
          const record = database.getOwnerPromotedAdmin(extra.from, target);
          const attempts = record?.demoteAttempts || 0;

          if (attempts === 0) {
            // 1st attempt → warn + re-promote + increment
            database.incrementDemoteAttempts(extra.from, target);
            const demoterNum = extra.sender.split('@')[0];

            // Re-promote the protected admin
            try {
              await sock.groupParticipantsUpdate(extra.from, [target], 'promote');
            } catch (e) {}

            return sock.sendMessage(extra.from, {
              text:
                `⚠️ *ADMIN PROTECTION*\n\n` +
                `@${targetNum} was promoted by the owner and is *protected*\n\n` +
                `⚠️ WARNING @${demoterNum}\n` +
                `You have been warned for attempting to demote a protected admin\n` +
                `If you do it again, you will be demoted`,
              mentions: [target, extra.sender],
            }, { quoted: msg });
          } else {
            // 2nd attempt → demote the violator + re-promote protected admin
            const demoterNum = extra.sender.split('@')[0];

            // Re-promote the protected admin
            try {
              await sock.groupParticipantsUpdate(extra.from, [target], 'promote');
            } catch (e) {}

            // Demote the violator
            try {
              await sock.groupParticipantsUpdate(extra.from, [extra.sender], 'demote');
            } catch (e) {}

            // Remove the protection record (protected admin is safe now)
            database.removeOwnerPromotedAdmin(extra.from, target);

            return sock.sendMessage(extra.from, {
              text:
                `🚨 *ADMIN PROTECTION — ACTION TAKEN*\n\n` +
                `@${targetNum} has been re-promoted ✅\n\n` +
                `@${demoterNum} has been *demoted* for repeatedly trying to demote a protected admin`,
              mentions: [target, extra.sender],
            }, { quoted: msg });
          }
        }
      }

      // ── Normal Demote ──────────────────────────────────────
      // Mark as bot-initiated so handler.js skips protection re-promote
      handler._botDemoted.add(target);
      await sock.groupParticipantsUpdate(extra.from, [target], 'demote');
      // Clean up after a short delay (handler fires within ~2s)
      setTimeout(() => handler._botDemoted.delete(target), 5000);

      await sock.sendMessage(extra.from, {
        text: `✅ SUCCESS\n\n⬇️ DEMOTED\n\n@${targetNum} is no longer a group admin`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Demote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't demote`);
    }
  },
};

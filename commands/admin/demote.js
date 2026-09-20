/**
 * Demote Command — Demote someone from WhatsApp group admin
 *
 * Protection system:
 * - If the target was promoted by the owner, only the owner can demote them
 * - 1st attempt → warning in group + DM
 * - 2nd attempt → violator gets demoted, protected admin re-promoted
 * - Owner can always demote freely
 */

const database = require('../../database');
const handler = require('../../handler');
const config = require('../../config');
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

      if (replyJid) {
        target = replyJid;
      } else if (mentioned.length > 0) {
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

      const targetNum = target.split(':')[0].split('@')[0];
      const demoterNum = extra.sender.split(':')[0].split('@')[0];

      // ── Owner-Promoted Admin Protection (BEFORE demoting) ──
      const isProtected = database.isOwnerPromotedAdmin(extra.from, target);

      if (isProtected) {
        if (extra.isOwner) {
          // Owner can always demote — remove protection and proceed
          database.removeOwnerPromotedAdmin(extra.from, target);
        } else {
          // Non-owner trying to demote a protected admin
          const record = database.getOwnerPromotedAdmin(extra.from, target);
          const attempts = record?.demoteAttempts || 0;

          if (attempts === 0) {
            // 1st attempt → warn + block
            database.incrementDemoteAttempts(extra.from, target);

            // Block the demotion — show authority in group
            await sock.sendMessage(extra.from, {
              text:
                `🚨 *ACCESS DENIED*\n\n` +
                `@${demoterNum} — you cannot demote @${targetNum}\n\n` +
                `This admin was promoted by the owner and is *protected*\n` +
                `Only the owner can demote them\n\n` +
                `⚠️ WARNING: Attempting this again will result in your demotion\n` +
                `This incident has been logged`,
              mentions: [target, extra.sender],
            });

            // DM the violator
            try {
              await sock.sendMessage(extra.sender, {
                text:
                  `🚨 *ADMIN WARNING*\n\n` +
                  `You tried to demote a protected admin in *${extra.from.split('@')[0]}*\n\n` +
                  `This admin was promoted by the owner\n` +
                  `Only the owner can demote them\n\n` +
                  `⚠️ If you try this again, you will be demoted yourself\n` +
                  `Do not attempt this again`,
              });
            } catch (e) {}

            // DM the protected admin — VIP treatment
            try {
              await sock.sendMessage(target, {
                text:
                  `🛡️ *YOU ARE PROTECTED*\n\n` +
                  `@${demoterNum} tried to demote you in *${extra.from.split('@')[0]}*\n\n` +
                  `The attempt was blocked — you're staying as admin\n` +
                  `Only the owner can demote you\n\n` +
                  `_You were promoted by the owner — act like it_ 👑`,
                mentions: [extra.sender],
              });
            } catch (e) {}

            // DM the owner
            const ownerNumbers = config.ownerNumber || [];
            for (const ownerNum of ownerNumbers) {
              try {
                const ownerJid = ownerNum.includes('@')
                  ? ownerNum
                  : `${ownerNum}@s.whatsapp.net`;
                await sock.sendMessage(ownerJid, {
                  text:
                    `🛡️ *ADMIN PROTECTION*\n\n` +
                    `@${demoterNum} tried to demote @${targetNum}\n` +
                    `in *${extra.from.split('@')[0]}*\n\n` +
                    `The demotion was blocked\n` +
                    `This admin was promoted by you and is protected\n` +
                    `If they try again, they will be demoted automatically`,
                  mentions: [target, extra.sender],
                });
              } catch (e) {}
            }

            return;
          } else {
            // 2nd attempt → demote the violator, re-promote protected admin

            // Re-promote the protected admin
            try {
              await sock.groupParticipantsUpdate(extra.from, [target], 'promote');
            } catch (e) {}

            // Demote the violator
            try {
              await sock.groupParticipantsUpdate(extra.from, [extra.sender], 'demote');
            } catch (e) {}

            // Remove protection record
            database.removeOwnerPromotedAdmin(extra.from, target);

            // Announce in group — show authority
            await sock.sendMessage(extra.from, {
              text:
                `🚨 *ADMIN PROTECTION — ACTION TAKEN*\n\n` +
                `@${demoterNum} has been *demoted* for repeatedly trying to demote a protected admin\n\n` +
                `@${targetNum} has been re-promoted ✅\n\n` +
                `_Only the owner decides who stays as admin_ 👑`,
              mentions: [target, extra.sender],
            });

            // DM the violator
            try {
              await sock.sendMessage(extra.sender, {
                text:
                  `🚨 *YOU HAVE BEEN DEMOTED*\n\n` +
                  `You repeatedly tried to demote a protected admin\n` +
                  `in *${extra.from.split('@')[0]}*\n\n` +
                  `This is your consequence\n` +
                  `Only the owner can demote people they've promoted`,
              });
            } catch (e) {}

            // DM the protected admin — VIP outcome
            try {
              await sock.sendMessage(target, {
                text:
                  `🛡️ *PROTECTION SERVED*\n\n` +
                  `@${demoterNum} tried to demote you twice in *${extra.from.split('@')[0]}*\n\n` +
                  `They have been *demoted* as a result\n` +
                  `You have been re-promoted ✅\n\n` +
                  `_The owner's word is final_ 👑`,
                mentions: [extra.sender],
              });
            } catch (e) {}

            return;
          }
        }
      }

      // ── Normal Demote ──────────────────────────────────────
      handler._botDemoted.add(target);
      await sock.groupParticipantsUpdate(extra.from, [target], 'demote');
      setTimeout(() => handler._botDemoted.delete(target), 5000);

      await sock.sendMessage(extra.from, {
        text: `✅ SUCCESS\n\n⬇️ DEMOTED\n\n@${targetNum} is no longer a group admin`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Demote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  },
};

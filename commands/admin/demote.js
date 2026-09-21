/**
 * Demote Command — Demote someone from WhatsApp group admin
 *
 * Protection: owner-promoted admins can only be demoted by the owner
 * 1st attempt → blocked + warned
 * 2nd attempt → violator demoted, protected admin re-promoted
 */

const database = require('../../database');
const handler = require('../../handler');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');

function getOwnerJid(sock) {
  const botId = sock.user?.id || '';
  const botNum = botId.includes(':') ? botId.split(':')[0] : botId.split('@')[0];
  const ownerNum = (config.ownerNumber || []).find(n => n !== botNum);
  if (!ownerNum) return null;
  return ownerNum.includes('@') ? ownerNum : `${ownerNum}@s.whatsapp.net`;
}

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

      // ── Owner-Promoted Admin Protection ────────────────────
      const isProtected = database.isOwnerPromotedAdmin(extra.from, target);

      if (isProtected) {
        if (extra.isOwner) {
          // Owner can always demote
          database.removeOwnerPromotedAdmin(extra.from, target);
        } else {
          const record = database.getOwnerPromotedAdmin(extra.from, target);
          const attempts = record?.demoteAttempts || 0;
          const ownerJid = getOwnerJid(sock);
          const ownerNum = ownerJid ? ownerJid.split(':')[0].split('@')[0] : '';

          if (attempts === 0) {
            // 1st attempt — warn + block
            database.incrementDemoteAttempts(extra.from, target);

            // Group — show authority
            await sock.sendMessage(extra.from, {
              text:
                `🚫 *NAH*\n\n` +
                `@${demoterNum} tried demoting @${targetNum}\n\n` +
                (ownerNum
                  ? `That's @${ownerNum}'s admin\n`
                  : `That's KAMI's admin\n`) +
                `You can't touch them\n\n` +
                `_Try that again and see what happens_`,
              mentions: ownerNum
                ? [target, extra.sender, ownerJid]
                : [target, extra.sender],
            });

            // DM victim
            try {
              await sock.sendMessage(target, {
                text:
                  `🛡️ *YOU GOOD*\n\n` +
                  `@${demoterNum} tried demoting you\n` +
                  `Blocked — you're still the admin\n` +
                  `_KAMI put you there, nobody else decides_ 👑`,
                mentions: [extra.sender],
              });
            } catch (e) {}

            // DM violator
            try {
              await sock.sendMessage(extra.sender, {
                text:
                  `🚫 *Oi*\n\n` +
                  `You just tried demoting someone KAMI promoted\n` +
                  `That's not how this works\n\n` +
                  `One more time and you're losing your admin too`,
              });
            } catch (e) {}

            // DM owner
            const ownerNumbers = config.ownerNumber || [];
            for (const oNum of ownerNumbers) {
              try {
                const oJid = oNum.includes('@') ? oNum : `${oNum}@s.whatsapp.net`;
                await sock.sendMessage(oJid, {
                  text:
                    `🛡️ *PROTECTION*\n\n` +
                    `@${demoterNum} tried demoting @${targetNum}\n` +
                    `Blocked ${pick(SLANG.vibe)}`,
                  mentions: [target, extra.sender],
                });
              } catch (e) {}
            }

            return;
          } else {
            // 2nd attempt — demote violator, re-promote protected admin
            try {
              await sock.groupParticipantsUpdate(extra.from, [target], 'promote');
            } catch (e) {}

            try {
              await sock.groupParticipantsUpdate(extra.from, [extra.sender], 'demote');
            } catch (e) {}

            database.removeOwnerPromotedAdmin(extra.from, target);

            // Log protection event
            database.logProtection({
              action: 'demote',
              target: target,
              targetName: targetName || null,
              triggeredBy: extra.sender,
              group: extra.from,
              result: 'demoted-violator',
            });

            // Group — show who's boss
            await sock.sendMessage(extra.from, {
              text:
                `🚨 *ADMIN PROTECTION*\n\n` +
                `@${demoterNum} got demoted\n` +
                (ownerNum
                  ? `Kept trying to touch @${ownerNum}'s admin\n\n`
                  : `Kept trying to touch KAMI's admin\n\n`) +
                `@${targetNum} back where they belong\n\n` +
                `_KAMI-Bot doesn't play_ 👑`,
              mentions: ownerNum
                ? [target, extra.sender, ownerJid]
                : [target, extra.sender],
            });

            // DM victim
            try {
              await sock.sendMessage(target, {
                text:
                  `🛡️ *SORTED*\n\n` +
                  `@${demoterNum} tried demoting you twice\n` +
                  `They got demoted for it\n` +
                  `You're back as admin\n\n` +
                  `_KAMI's word is final_ 👑`,
                mentions: [extra.sender],
              });
            } catch (e) {}

            // DM violator
            try {
              await sock.sendMessage(extra.sender, {
                text:
                  `🚨 *YOU GOT DEMOTED*\n\n` +
                  `Kept trying to demote KAMI's admin\n` +
                  `Now you're regular\n\n` +
                  `_Should've left it alone_`,
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
        text:
          `✅ SUCCESS\n\n` +
          `⬇️ DEMOTED\n\n` +
          `@${targetNum} is no longer a group admin\n\n` +
          `_${pick(SLANG.vibe)}_`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Demote error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't demote`);
    }
  },
};

/**
 * Kick Command — Remove mentioned or replied users from the group
 * Protection: owner-added/promoted members can't be kicked by others
 */

const database = require('../../database');
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
  name: 'kick',
  aliases: ['remove'],
  category: 'admin',
  description: 'Kick mentioned/replied members from the group',
  usage: '.kick @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      let usersToKick = [];

      if (mentioned && mentioned.length > 0) {
        usersToKick = mentioned;
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        usersToKick = [ctx.participant];
      }

      if (usersToKick.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nTag or reply to the person you wanna kick`
        );
      }

      // ── Self-kick prevention ──────────────────────────────
      const botId = sock.user?.id || '';
      const botPhoneNumber = botId.includes(':')
        ? botId.split(':')[0]
        : botId.includes('@')
          ? botId.split('@')[0]
          : botId;

      const isTryingToKickBot = usersToKick.some(
        (userId) => userId.split(':')[0].split('@')[0] === botPhoneNumber
      );

      if (isTryingToKickBot) {
        return extra.reply(`❌ ERROR\n\nCan't kick myself`);
      }

      // ── Owner Kick Protection ────────────────────────────
      // Nobody can kick the owner via .kick command
      if (!extra.isOwner) {
        for (const target of usersToKick) {
          const targetNum = target.split(':')[0].split('@')[0].replace(/\D/g, '');
          const isTargetOwner = (config.ownerNumber || []).some(n => {
            const ownerNum = n.replace(/\D/g, '');
            return targetNum === ownerNum;
          });
          if (isTargetOwner) {
            const kickerNum = extra.sender.split(':')[0].split('@')[0];
            await sock.sendMessage(chatId, {
              text:
                `🚫 *NAH*\n\n` +
                `@${kickerNum} — you can't kick the owner\n` +
                `That's not happening`,
              mentions: [extra.sender],
            });
            return;
          }
        }
      }

      // ── Owner protection check ────────────────────────────
      if (!extra.isOwner) {
        for (const target of usersToKick) {
          if (database.isOwnerProtected(chatId, target)) {
            const targetNum = target.split(':')[0].split('@')[0];
            const kickerNum = extra.sender.split(':')[0].split('@')[0];
            const ownerJid = getOwnerJid(sock);
            const ownerNum = ownerJid ? ownerJid.split(':')[0].split('@')[0] : '';

            // Block — group message
            await sock.sendMessage(chatId, {
              text:
                `🚫 *ACCESS DENIED*\n\n` +
                `@${kickerNum} — nah you can't kick @${targetNum}\n\n` +
                (ownerNum
                  ? `That's @${ownerNum}'s person\n`
                  : `That's KAMI's person\n`) +
                `Only KAMI-Bot can remove them`,
              mentions: ownerNum
                ? [target, extra.sender, ownerJid]
                : [target, extra.sender],
            });

            // DM victim
            try {
              await sock.sendMessage(target, {
                text:
                  `🛡️ *YOU GOOD*\n\n` +
                  `@${kickerNum} tried to kick you\n` +
                  `Blocked — you're staying`,
                mentions: [extra.sender],
              });
            } catch (e) {}

            // DM violator
            try {
              await sock.sendMessage(extra.sender, {
                text:
                  `🚫 *Oi*\n\n` +
                  `You just tried kicking someone KAMI added\n` +
                  `That's not happening\n\n` +
                  `Don't try that again`,
              });
            } catch (e) {}

            // Log protection event
            database.logProtection({
              action: 'kick',
              target: target,
              targetName: targetName || null,
              triggeredBy: extra.sender,
              group: chatId,
              result: 'blocked',
            });

            // DM owner
            const ownerNumbers = config.ownerNumber || [];
            for (const oNum of ownerNumbers) {
              try {
                const oJid = oNum.includes('@') ? oNum : `${oNum}@s.whatsapp.net`;
                await sock.sendMessage(oJid, {
                  text:
                    `🛡️ *PROTECTION*\n\n` +
                    `@${kickerNum} tried kicking @${targetNum}\n` +
                    `Blocked ${pick(SLANG.vibe)}`,
                  mentions: [target, extra.sender],
                });
              } catch (e) {}
            }

            return;
          }
        }
      }

      // ── Safe to kick ─────────────────────────────────────
      await sock.groupParticipantsUpdate(chatId, usersToKick, 'remove');

      const usernames = usersToKick.map((jid) => `@${jid.split(':')[0].split('@')[0]}`);
      await sock.sendMessage(chatId, {
        text:
          `🔨 KICKED\n\n` +
          `${usernames.join(', ')} has been kicked\n\n` +
          `_${pick(SLANG.vibe)}_`,
        mentions: usersToKick,
      }, { quoted: msg });

    } catch (error) {
      console.error('Kick command error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't kick`);
    }
  },
};

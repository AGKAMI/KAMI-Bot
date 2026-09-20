/**
 * Kick Command
 * Remove mentioned or replied users from the group
 *
 * Protection: if target was added/promoted by owner, block the kick
 * and warn the person attempting it — in the group AND via DM.
 */

const database = require('../../database');
const handler = require('../../handler');
const config = require('../../config');
const { pick, SLANG } = require('../../utils/format');

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
          `👤 *KICK*\n\nTag or reply to the ${pick(SLANG.friend)} you wanna kick`
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
        await extra.reply(`❌ ERROR\n\nCan't kick myself ${pick(SLANG.friend)}`);
        return;
      }

      // ── Owner protection check (BEFORE kicking) ───────────
      if (!extra.isOwner) {
        for (const target of usersToKick) {
          if (database.isOwnerProtected(chatId, target)) {
            const targetNum = target.split(':')[0].split('@')[0];
            const kickerNum = extra.sender.split(':')[0].split('@')[0];

            // Block the kick — don't do it
            await sock.sendMessage(chatId, {
              text:
                `🚨 *ACCESS DENIED*\n\n` +
                `@${kickerNum} — you cannot kick @${targetNum}\n\n` +
                `This member was personally added/promoted by the owner\n` +
                `Only the owner can remove them\n\n` +
                `⚠️ This incident has been logged`,
              mentions: [target, extra.sender],
            });

            // DM the violator
            try {
              await sock.sendMessage(extra.sender, {
                text:
                  `🚨 *ADMIN WARNING*\n\n` +
                  `You tried to kick a protected member in *${chatId.split('@')[0]}*\n\n` +
                  `This member was added/promoted by the owner\n` +
                  `Only the owner can remove people they've added\n\n` +
                  `⚠️ Do not attempt this again`,
              });
            } catch (e) {}

            // DM the victim — let them know they're protected
            try {
              await sock.sendMessage(target, {
                text:
                  `🛡️ *YOU ARE PROTECTED*\n\n` +
                  `@${kickerNum} tried to kick you from *${chatId.split('@')[0]}*\n\n` +
                  `The attempt was blocked — you're staying\n` +
                  `Only the owner can remove you`,
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
                    `🛡️ *MEMBER PROTECTION*\n\n` +
                    `@${kickerNum} tried to kick @${targetNum}\n` +
                    `in *${chatId.split('@')[0]}*\n\n` +
                    `The kick was blocked\n` +
                    `This member was added/promoted by you and is protected`,
                  mentions: [target, extra.sender],
                });
              } catch (e) {}
            }

            return; // Don't kick
          }
        }
      }

      // ── Safe to kick ─────────────────────────────────────
      await sock.groupParticipantsUpdate(chatId, usersToKick, 'remove');

      const usernames = usersToKick.map((jid) => `@${jid.split(':')[0].split('@')[0]}`);
      const text = `🔨 KICKED\n\n${usernames.join(', ')} has been kicked ${pick(SLANG.good)}`;

      await sock.sendMessage(extra.from, { text, mentions: usersToKick }, { quoted: msg });
    } catch (error) {
      console.error('Kick command error:', error);
      await extra.reply(
        `❌ ERROR\n\nCouldn't kick — check if I'm admin ${pick(SLANG.vibe)}`
      );
    }
  },
};

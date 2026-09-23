/**
 * Kick Command — Remove mentioned or replied users from the group
 * Protection: owner-added/promoted members can't be kicked by others
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

// Lazy require to avoid circular dependency (kick.js ↔ handler.js via commandLoader)
function getHandler() {
  return require('../../handler');
}

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
          `❌ ERROR\n\n` +
          `Tag or reply to the person you wanna kick`
        );
      }

      // ── Check if target is actually in the group ──────────
      const meta = await sock.groupMetadata(chatId).catch(() => null);
      if (meta && meta.participants) {
        for (const target of usersToKick) {
          const isInGroup = meta.participants.some(
            p => p.id === target || p.lid === target
          );
          if (!isInGroup) {
            return extra.reply(
              `❌ ERROR\n\n` +
              `${mention(target)} is not in this group\n\n` +
              `Can't kick someone who's not here`
            );
          }
        }
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
            await sock.sendMessage(chatId, {
              text:
                `🚫 *YOH THE AUDACITY* 💀\n\n` +
                `${mention(extra.sender)} — you really just tried to kick KAMI??\n\n` +
                `No way you tryna kick the owner bru 😭\n` +
                `Don't act like a laaitie man, ${pick(SLANG.dismiss)}`,
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
            const ownerJid = getOwnerJid(sock);

            // Block — group message
            await sock.sendMessage(chatId, {
              text:
                `🚫 *NAH BRU* 💀\n\n` +
                `${mention(extra.sender)} — you really thought you could kick ${mention(target)}??\n\n` +
                (ownerJid
                  ? `That's ${mention(ownerJid)}'s person wena 💀\n`
                  : `That's KAMI's person wena 💀\n`) +
                `Only KAMI-Bot decides who stays and who goes\n\n` +
                `${pick(SLANG.roast)}`,
              mentions: ownerJid
                ? [target, extra.sender, ownerJid]
                : [target, extra.sender],
            });

            // DM victim
            try {
              await sock.sendMessage(target, {
                text:
                  `🛡️ *YOU GOOD* 💪\n\n` +
                  `${mention(extra.sender)} tried kicking you hey 💀\n` +
                  `Sorted — you're not going anywhere\n\n` +
                  `${pick(SLANG.protected)}`,
                mentions: [extra.sender],
              });
            } catch (e) {}

            // DM violator
            try {
              await sock.sendMessage(extra.sender, {
                text:
                  `🚫 *OOF* 💀\n\n` +
                  `You really just tried kicking someone KAMI added??\n\n` +
                  `Yoh the audacity bru 😭\n` +
                  `Don't try that again hey, ${pick(SLANG.dismiss)}`,
              });
            } catch (e) {}

            // Log protection event
            database.logProtection({
              action: 'kick',
              target: target,
              targetName: null,
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
                    `🛡️ *PROTECTION* 💀\n\n` +
                    `${mention(extra.sender)} tried kicking ${mention(target)}\n` +
                    `Blocked — they really thought they could tho 😭\n\n` +
                    `${pick(SLANG.roast)}`,
                  mentions: [target, extra.sender],
                });
              } catch (e) {}
            }

            return;
          }
        }
      }

      // ── Safe to kick ─────────────────────────────────────
      // Mark targets so handler protection doesn't re-add them
      const handler = getHandler();
      for (const t of usersToKick) handler._botKicked.add(t);
      setTimeout(() => {
        for (const t of usersToKick) handler._botKicked.delete(t);
      }, 5000);

      await sock.groupParticipantsUpdate(chatId, usersToKick, 'remove');

      const usernames = usersToKick.map((jid) => mention(jid));
      const primaryTarget = usersToKick[0];
      await sendButtons(sock, chatId, {
        text:
          `✅ SUCCESS\n\n` +
          `🔨 KICKED\n\n` +
          `${usernames.join(', ')} has been kicked\n\n` +
          `_${pick(SLANG.vibe)}_`,
        mentions: usersToKick,
        footer: 'Kick Management',
        buttons: [
          { id: `admin:readd:${primaryTarget.split(':')[0]}`, text: '🔄 Re-add User' },
        ],
      }, { quoted: msg });

    } catch (error) {
      console.error('Kick command error:', error);
      const reason = error?.message || error?.output?.payload?.message || 'Unknown error';
      await extra.reply(`❌ ERROR\n\nCouldn't kick — ${reason}`);
    }
  },
};

// Button handlers
onButton('admin:readd', async (sock, msg, from, sender, btnId) => {
  const target = btnId.replace('admin:readd:', '');
  if (!target) return;

  const { buildComparableIds, normalizeJidWithLid } = require('../../utils/jidHelper');

  // Check if already in the group
  try {
    const meta = await sock.groupMetadata(from).catch(() => null);
    if (meta && meta.participants) {
      const isInGroup = meta.participants.some(
        p => p.id === target || p.lid === target
      );
      if (isInGroup) {
        return await sock.sendMessage(from, {
          text:
            `❌ ERROR\n\n` +
            `${mention(target)} is already in the group`,
          mentions: [target],
        });
      }
    }

    // Build list of JIDs to try — same approach as !add (prefer @s.whatsapp.net)
    const candidateJids = [];

    // 1. Strip device suffix: 27683993925:0@s.whatsapp.net → 27683993925@s.whatsapp.net
    const stripped = target.replace(/:\d+@/, '@');
    if (stripped !== target) candidateJids.push(stripped);

    // 2. LID → PN mapping via normalizeJidWithLid
    const resolved = normalizeJidWithLid(target);
    if (resolved && resolved !== target && resolved !== stripped) candidateJids.push(resolved);

    // 3. All buildComparableIds variants
    for (const v of buildComparableIds(target)) {
      if (!candidateJids.includes(v)) candidateJids.push(v);
    }

    // 4. Original as last resort
    candidateJids.push(target);

    let added = false;
    let lastErr = '';
    for (const jid of candidateJids) {
      try {
        await sock.groupParticipantsUpdate(from, [jid], 'add');
        added = true;
        break;
      } catch (e) {
        lastErr = e.message || 'unknown';
      }
    }

    if (!added) {
      return await sock.sendMessage(from, {
        text: `❌ ERROR\n\nCouldn't re-add — ${lastErr}`,
      });
    }

    await sock.sendMessage(from, {
      text:
        `✅ SUCCESS\n\n` +
        `🔄 RE-ADDED\n\n` +
        `${mention(target)} has been re-added to the group\n\n` +
        `_${pick(SLANG.vibe)}_`,
      mentions: [target],
    });
  } catch (e) {
    console.error('[READD BTN] Error:', e.message);
    await sock.sendMessage(from, {
      text:
        `❌ ERROR\n\n` +
        `Couldn't re-add — ${e.message || 'Unknown error'}`,
    });
  }
});

/**
 * Demote Command — Demote someone from WhatsApp group admin
 *
 * Protection: owner-promoted admins can only be demoted by the owner
 * 1st attempt → blocked + warned
 * 2nd attempt → violator demoted, protected admin re-promoted
 */

const database = require('../../database');
const config = require('../../config');
const { pick, SLANG, mention, voice } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { buildComparableIds } = require('../../utils/jidHelper');

// Lazy require to avoid circular dependency (demote.js ↔ handler.js)
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
  name: 'demote',
  reactions: { received: '📉', done: '⬇️' },
  category: 'admin',
  description: 'Demote an admin to a regular member',
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

      // Priority: @mention → reply → JID via args (button delegation)
      if (mentioned.length > 0) {
        target = mentioned[0];
      } else if (replyJid) {
        target = replyJid;
      } else if (args.length > 0 && String(args[0]).includes('@')) {
        target = String(args[0]);
      }

      if (!target) {
        const { openPicker } = require('../../utils/memberPicker');
        if (await openPicker(sock, msg, extra.from, 'demote', { groupMetadata: extra.groupMetadata })) return;
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\n` +
          `Tag or reply to somebody\n\n` +
          `Usage:\n` +
          `• ${config.prefix || '.'}demote @user\n` +
          `• Reply with ${config.prefix || '.'}demote`
        );
      }

      // ── Admin-only check — also guards direct execute() calls from the demote button ──
      if (!extra.isOwner) {
        const meta0 = await sock.groupMetadata(extra.from).catch(() => null);
        const demoterIsAdmin = meta0?.participants?.some(
          p => (p.id === extra.sender || p.lid === extra.sender) && (p.admin === 'admin' || p.admin === 'superadmin')
        );
        if (!demoterIsAdmin) {
          return extra.reply(`🛡️ *ADMIN ONLY*\n\nOnly group admins can demote members, shame.`);
        }
      }

      const targetNum = target.split(':')[0].split('@')[0];
      const demoterNum = extra.sender.split(':')[0].split('@')[0];

      // ── Check if target is actually an admin ──────────────
      const meta = await sock.groupMetadata(extra.from).catch(() => null);
      if (meta && meta.participants) {
        const isAdmin = meta.participants.some(
          p => (p.id === target || p.lid === target) && (p.admin === 'admin' || p.admin === 'superadmin')
        );
        if (!isAdmin) {
          extra.fail();
          return extra.reply(
            `❌ ERROR\n\n` +
            `${mention(target)} isn't an admin\n\n` +
            `Can't demote someone who isn't an admin, hey`
          );
        }
      }

      // ── Owner Demote Protection ────────────────────────────
      // Nobody can demote the owner — block silently
      if (!extra.isOwner && extra.isOwnerMentioned) {
        await sock.sendMessage(extra.from, {
          text:
            `🚫 *YOH THE AUDACITY* 💀\n\n` +
            `${mention(extra.sender)} — you really tried to demote KAMI?? yoh\n\n` +
            `No way you tryna demote the owner, bru 😭\n` +
            `Don't act like a laaitie man, ${voice.tag('neutral')}`,
          mentions: [extra.sender],
        }, { quoted: msg });
        return;
      }
      // Also check by JID match
      const isTargetOwner = (config.ownerNumber || []).some(n => {
        const ownerNum = n.replace(/\D/g, '');
        return targetNum === ownerNum;
      });
      if (!extra.isOwner && isTargetOwner) {
        await sock.sendMessage(extra.from, {
          text:
            `🚫 *YOH THE AUDACITY* 💀\n\n` +
            `${mention(extra.sender)} — you really tried to demote KAMI?? yoh\n\n` +
            `No way you tryna demote the owner, bru 😭\n` +
            `Don't act like a laaitie man, ${voice.tag('neutral')}`,
          mentions: [extra.sender],
        }, { quoted: msg });
        return;
      }

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
                `🚫 *NAH BRU* 💀\n\n` +
                `${mention(extra.sender)} tried demoting ${mention(target)}\n\n` +
                (ownerNum
                  ? `That's ${mention(ownerJid)}'s admin wena 💀\n`
                  : `That's KAMI's admin wena 💀\n`) +
                `You can't touch them\n\n` +
                `_Try that again and see what happens, ${voice.tag('neutral')}_`,
              mentions: ownerNum
                ? [target, extra.sender, ownerJid]
                : [target, extra.sender],
            }, { quoted: msg });

            // DM victim
            try {
              await sock.sendMessage(target, {
                text:
                  `🛡️ *YOU GOOD* 💪\n\n` +
                  `${mention(extra.sender)} tried demoting you hey 💀\n` +
                  `Blocked — you're still the admin, ne\n\n` +
                  `KAMI put you there — nobody else decides 👑`,
                mentions: [extra.sender],
              });
            } catch (e) {}

            // DM violator
            try {
              await sock.sendMessage(extra.sender, {
                text:
                  `🚫 *OOF* 💀\n\n` +
                  `You really tried demoting someone KAMI promoted?? cheeky\n\n` +
                  `Yoh the audacity bru 😭\n` +
                  `One more time and you're losing your admin too hey`,
              });
            } catch (e) {}

            // DM owner
            const ownerNumbers = config.ownerNumber || [];
            for (const oNum of ownerNumbers) {
              try {
                const oJid = oNum.includes('@') ? oNum : `${oNum}@s.whatsapp.net`;
                await sock.sendMessage(oJid, {
                  text:
                    `🛡️ *PROTECTION* 💀\n\n` +
                    `${mention(extra.sender)} tried demoting ${mention(target)}\n` +
                    `Blocked — they really thought they could tho 😭\n\n` +
                    `${voice.say('tease')}`,
                  mentions: [target, extra.sender],
                });
              } catch (e) {}
            }

            return;
          } else {
            // 2nd attempt — demote violator, re-promote protected admin
            // Honest: both ops status-checked — refused ops resolve without
            // throwing, and every claim below used to fire regardless.
            const { groupAction } = require('../../utils/groupActions');
            const restoreAdmin = await groupAction(
              sock, extra.from,
              [target, ...buildComparableIds(target)], 'promote'
            );
            const violatorDown = await groupAction(
              sock, extra.from,
              [extra.sender, ...buildComparableIds(extra.sender)], 'demote'
            );

            database.removeOwnerPromotedAdmin(extra.from, target);

            // Log protection event
            database.logProtection({
              action: 'demote',
              target: target,
              targetName: null,
              triggeredBy: extra.sender,
              group: extra.from,
              result: !violatorDown.ok
                ? 'demote-failed'
                : restoreAdmin.ok ? 'demoted-violator' : 'demoted-violator-restore-failed',
            });

            // Group — show who's boss (only what really happened)
            const attemptLine = violatorDown.ok
              ? `${mention(extra.sender)} got demoted 💀\n`
              : `${mention(extra.sender)} tried again — I couldn't demote them (${violatorDown.error || 'not allowed'})\n`;
            const backLine = restoreAdmin.ok
              ? `${mention(target)} back where they belong\n\n`
              : `⚠️ Couldn't re-promote ${mention(target)} (${restoreAdmin.error || 'not allowed'}) — KAMI, sort my admin status hey\n\n`;
            await sock.sendMessage(extra.from, {
              text:
                `🚨 *CAUGHT IN 4K* 💸\n\n` +
                attemptLine +
                (ownerNum
                  ? `Kept trying to touch ${mention(ownerJid)}'s admin, bru\n\n`
                  : `Kept trying to touch KAMI's admin, bru\n\n`) +
                backLine +
                `_KAMI-Bot doesn't play_ 👑`,
              mentions: ownerNum
                ? [target, extra.sender, ownerJid]
                : [target, extra.sender],
            }, { quoted: msg });

            // DM victim — claims mirror the real op outcomes
            try {
              const victimHeader = (violatorDown.ok || restoreAdmin.ok)
                ? `🛡️ *SORTED* 💪\n\n`
                : `🛡️ *PROTECTION* 💪\n\n`;
              const victimLines = violatorDown.ok
                ? `They got demoted for it\n`
                : `I couldn't demote them this time (${violatorDown.error || 'not allowed'})\n`;
              const victimAdmin = restoreAdmin.ok
                ? `You're back as admin\n\n`
                : `⚠️ I couldn't restore your admin (${restoreAdmin.error || 'not allowed'}) — KAMI needs to sort it\n\n`;
              await sock.sendMessage(target, {
                text:
                  victimHeader +
                  `${mention(extra.sender)} tried demoting you twice hey 💀\n` +
                  victimLines +
                  victimAdmin +
                `${voice.say('protected')}`,
                mentions: [extra.sender],
              });
            } catch (e) {}

            // DM violator — only when the demote actually landed
            if (violatorDown.ok) {
              try {
                await sock.sendMessage(extra.sender, {
                  text:
                    `🚨 *YOU GOT DEMOTED* 💀\n\n` +
                    `Kept trying to demote KAMI's admin, bru\n` +
                    `Now you're regular\n\n` +
                    `Yoh you really didn't listen the first time tho 😭\n` +
                    `_Should've left it alone_`,
                });
              } catch (e) {}
            }

            // DM owner — claims mirror the real op outcomes
            const ownerNumbers2 = config.ownerNumber || [];
            const ownerDemoteLine = violatorDown.ok
              ? `They got demoted for it\n`
              : `⚠️ I couldn't demote them (${violatorDown.error || 'not allowed'})\n`;
            const ownerBackLine = restoreAdmin.ok
              ? `${mention(target)} back where they belong\n\n`
              : `⚠️ Couldn't restore ${mention(target)}'s admin — check my status hey\n\n`;
            for (const oNum of ownerNumbers2) {
              try {
                const oJid2 = oNum.includes('@') ? oNum : `${oNum}@s.whatsapp.net`;
                await sock.sendMessage(oJid2, {
                  text:
                    `🛡️ *ADMIN PROTECTION* 💀\n\n` +
                    `${mention(extra.sender)} tried demoting ${mention(target)} twice\n` +
                    ownerDemoteLine +
                    ownerBackLine +
                    `${voice.say('protected')}`,
                  mentions: [target, extra.sender],
                });
              } catch (e) {}
            }

            return;
          }
        }
      }

      // ── Normal Demote ──────────────────────────────────────
      const handler = getHandler();
      handler._botDemoted.add(target);
      // Honest outcome — a failed demote used to report ✅ DEMOTED
      const { groupAction } = require('../../utils/groupActions');
      const demoteOutcome = await groupAction(sock, extra.from, [target, ...buildComparableIds(target)], 'demote');
      if (!demoteOutcome.ok) {
        extra.fail();
        return await sock.sendMessage(extra.from, {
          text:
            `❌ ERROR\n\n` +
            `Couldn't demote ${mention(target)} — ${demoteOutcome.error || 'not admin / not allowed'}\n\n` +
            `_They may not be an admin, or I lack permission_`,
          mentions: [target],
        }, { quoted: msg });
      }
      setTimeout(() => handler._botDemoted.delete(target), 5000);

      // Track owner demotions — blocks future promotes by anyone else
      let demoteNote = '';
      if (extra.isOwner) {
        database.addOwnerDemoted(extra.from, target, extra.sender);
        demoteNote = '\n\n🚫 This person can *never be promoted* by anyone else — only you can';
      }

      await sendButtons(sock, extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `⬇️ DEMOTED\n\n` +
          `${mention(target)} is no longer a group admin, shame${demoteNote}\n\n` +
          `_${voice.react('ok')}_`,
        mentions: [target],
        footer: 'Admin Actions',
        buttons: [
          { id: `admin:promote:${target.split(':')[0]}`, text: '⬆️ Promote Back' },
        ],
      }, { quoted: msg });

    } catch (error) {
      console.error('Demote error:', error);
      const reason = error?.message || error?.output?.payload?.message || 'Unknown error';
      extra.fail();
      await extra.reply(`❌ ERROR\n\nCouldn't demote — ${reason}`);
    }
  },
};

// Button handlers
onButton('admin:promote', async (sock, msg, from, sender, btnId) => {
  const target = btnId.replace('admin:promote:', '');
  if (!target) return;

  // Permission check — only group admins or owner can promote
  try {
    const meta = await sock.groupMetadata(from).catch(() => null);
    if (meta && meta.participants) {
      const clickerIsAdmin = meta.participants.some(
        p => (p.id === sender || p.lid === sender) && (p.admin === 'admin' || p.admin === 'superadmin')
      );
      const config = require('../../config');
      const clickerIsOwner = (config.ownerNumber || []).some(n => sender.includes(n));
      if (!clickerIsAdmin && !clickerIsOwner) {
        return await sock.sendMessage(from, {
          text: `❌ *ADMIN ONLY*\n\nOnly group admins can promote members, shame.`,
          mentions: [sender],
        }, { quoted: msg });
      }
    }
  } catch (e) {
    console.error('[PROMOTE BTN] permission check failed:', e.message);
  }

  // ── Owner-demoted blacklist — only the owner can promote them again ──
  const btnOwnerNums = (require('../../config').ownerNumber || []);
  const btnSenderIsOwner = btnOwnerNums.some(n => sender.includes(n));
  if (!btnSenderIsOwner && database.isOwnerDemoted(from, target)) {
    return await sock.sendMessage(from, {
      text:
        `🚫 *PROMOTE BLOCKED*\n\n` +
        `${mention(target)} got demoted by the owner\n\n` +
        `Only the owner can promote them again, hey`,
      mentions: [target],
    }, { quoted: msg });
  }

  // ── Check if target is already admin before promoting ──
  try {
    const meta = await sock.groupMetadata(from).catch(() => null);
    if (meta && meta.participants) {
      const isAlreadyAdmin = meta.participants.some(
        p => (p.id === target || p.lid === target) && (p.admin === 'admin' || p.admin === 'superadmin')
      );
      if (isAlreadyAdmin) {
        return await sock.sendMessage(from, {
          text:
            `❌ ERROR\n\n` +
            `${mention(target)} is already an admin, ne`,
          mentions: [target],
        }, { quoted: msg });
      }
    }

    // Honest promote — status codes checked (a 403 used to fly through)
    const { groupAction } = require('../../utils/groupActions');
    const promoteOutcome = await groupAction(sock, from, [target, ...buildComparableIds(target)], 'promote');
    if (!promoteOutcome.ok) {
      return await sock.sendMessage(from, {
        text:
          `❌ ERROR\n\n` +
          `Couldn't promote ${mention(target)} — ${promoteOutcome.error || 'not allowed'}\n\n` +
          `_Check I'm a group admin, shame_`,
        mentions: [target],
      }, { quoted: msg });
    }

    // Track owner-promoted admins for protection + clear demoted flag (owner re-promotion = forgiveness)
    let protectionNote = '';
    if (btnSenderIsOwner) {
      database.addOwnerPromotedAdmin(from, target, sender);
      database.removeOwnerDemoted(from, target);
      protectionNote = '\n\n🛡️ This admin is now *protected* — only you can demote them';
    }

    await sock.sendMessage(from, {
      text:
        `✅ SUCCESS\n\n` +
        `⬆️ PROMOTED\n\n` +
        `${mention(target)} is now a group admin, lekke${protectionNote}\n\n` +
        `_${voice.react('ok')}_`,
      mentions: [target],
    }, { quoted: msg });
  } catch (e) {
    console.error('[PROMOTE BTN] Error:', e.message);
    await sock.sendMessage(from, {
      text:
        `❌ ERROR\n\n` +
        `Couldn't promote — ${e.message || 'Unknown error'}`,
    }, { quoted: msg });
  }
});

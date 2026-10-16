/**
 * Unblock Command - Unblock a user
 */

const config = require('../../config');
const database = require('../../database');
const { bold, pick, SLANG, voice, mention } = require('../../utils/format');
const { updateBlockStatusSafe, mentionJid, trackSendAck, inBlocklist } = require('../../utils/jidHelper');

const parsePhoneNumber = (input) => {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('0')) digits = (config.defaultCountryCode || '27') + digits.slice(1);
  return digits + '@s.whatsapp.net';
};

module.exports = {
  name: 'unblock',
  reactions: { received: '⭕', done: '🔓' },
  aliases: [],
  category: 'owner',
  description: 'Unblock a user',
  usage: '.unblock @user/reply OR .unblock 27833882383 OR .unblock me',
  ownerOnly: true,
  
  async execute(sock, msg, args, extra) {
    try {
      let target;
      
      // .unblock me — unblock the sender
      if (args[0] && args[0].toLowerCase() === 'me') {
        target = extra.sender;
      } else {
        // .unblock <phone number>
        const rawArg = args.join(' ');
        if (rawArg && /\d/.test(rawArg)) {
          target = parsePhoneNumber(rawArg);
          if (!target) {
            extra.fail();
            return extra.reply(`❌ ERROR\n\n_Invalid number_`);
          }
        } else {
          // Tag or reply
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const mentioned = ctx?.mentionedJid || [];
          
          if (mentioned && mentioned.length > 0) {
            target = mentioned[0];
          } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
            target = ctx.participant;
          } else {
            extra.fail();
            return extra.reply(`❌ ERROR\n\n_Tag, reply, or drop a number_\n\n_Examples:_\n${config.prefix || '.'}unblock 27833882383\n${config.prefix || '.'}unblock 083 388 2383\n${config.prefix || '.'}unblock me`);
          }
        }
      }

      // Real number when the target arrived as LID digits (used everywhere below)
      const shown = mentionJid(target);
      const shownDigits = shown.split('@')[0].replace(/\D/g, '');

      // Read the real block list FIRST — the owner gets the truth: a ✅
      // verdict for someone who was never blocked is worse than no answer.
      let listOk = true;
      let wasBlocked = true;
      try {
        wasBlocked = inBlocklist(await sock.fetchBlocklist(), target);
      } catch (e) {
        listOk = false; // can't read the list — best-effort unlock below
        console.error('[UNBLOCK] fetchBlocklist failed:', e.message);
      }

      if (listOk && !wasBlocked) {
        const already = !database.addApprovedNumber(shownDigits);
        extra.fail();
        return sock.sendMessage(extra.from, {
          text:
            `⚠️ NOT BLOCKED\n\n` +
            `${mention(shown)} _ain't blocked — nothing to unlock_\n\n` +
            (already
              ? `✅ Already on the approved list — the DM guard won't touch them`
              : `✅ Added to the approved list — the DM guard won't touch them`),
          mentions: [shown],
        }, { quoted: msg });
      }

      // Unblock directly — tries each PN/LID variant, throws if none took.
      await updateBlockStatusSafe(sock, target, 'unblock');

      // Verify against a fresh read — WhatsApp accepting the call is not proof.
      if (listOk) {
        try {
          if (inBlocklist(await sock.fetchBlocklist(), target)) {
            extra.fail();
            return sock.sendMessage(extra.from, {
              text:
                `❌ ERROR\n\n` +
                `WhatsApp took the unlock but ${mention(shown)} is *still on the block list*\n\n` +
                `_Try again in a moment, ${voice.tag('err')}_`,
              mentions: [shown],
            }, { quoted: msg });
          }
        } catch (e) {
          listOk = false; // can't prove it either way — say so below
          console.error('[UNBLOCK] verify fetch failed:', e.message);
        }
      }

      // Pair with the DM guard — without approval the stranger path re-blocks
      // them on their very next DM and the unlock silently evaporates.
      const newlyApproved = !!shownDigits && database.addApprovedNumber(shownDigits);
      const approvalLine = newlyApproved
        ? `✅ Added to the approved list — the DM guard won't re-block them`
        : `✅ Already on the approved list — the DM guard won't re-block them`;

      // DM the unblocked user — failure is captured and SHOWN to the owner
      let dmErr = '';
      let sentKey = null;
      try {
        const sent = await sock.sendMessage(shown, {
          text:
            `━━━━━━━━━━━━━━━━\n` +
            `*KAMI UNLOCKED YOU* 🔓\n` +
            `━━━━━━━━━━━━━━━━\n\n` +
            `${voice.greetOpen()}, ${voice.mate()}\n\n` +
            `_You were blocked but you're free now_`
        });
        sentKey = sent && sent.key ? sent.key : null;
        console.log(`[UNBLOCK] unlock DM sent to ${shown}`);
      } catch (e) {
        dmErr = e.message || 'unknown error';
        console.error(`[UNBLOCK] DM to unblocked user failed for ${shown}:`, dmErr);
      }
      if (sentKey) trackSendAck(sock, sentKey, 'UNBLOCK-DM');

      // Confirmation to owner (verified state + DM outcome attached)
      let reply = `*✅ UNBLOCKED*\n\n${mention(shown)} _has been unblocked, ${voice.tag('affirm')}!_\n\n${approvalLine}`;
      if (!listOk) {
        reply += `\n\n⚠️ *Block list unavailable — unlock attempted but not verified*`;
      }
      if (dmErr) {
        extra.fail();
        reply += `\n\n⚠️ *Unlock DM failed:* ${dmErr}` +
          (/not-authorized|forbidden|blocked/i.test(dmErr)
            ? `\n_They've most likely blocked the bot — they're unblocked, but the unlock message can't reach them._`
            : `\n_They're unblocked — the unlock DM just couldn't be delivered._`);
      }
      await sock.sendMessage(extra.from, {
        text: reply,
        mentions: [shown]
      }, { quoted: msg });
      
    } catch (error) {
      extra.fail();
      await extra.reply(`❌ *ERROR*\n💡 ${voice.openErr()} — couldn't unblock them: ${error.message}`);
    }
  }
};

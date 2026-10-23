/**
 * protectionDm — Member Protection re-add offers
 *
 * When a protected member (owner-added / owner-promoted) is kicked by a
 * human admin via the native WhatsApp UI, the bot no longer re-adds them
 * instantly. It DMs the member a two-button offer instead:
 *
 *   🔄 Bring me back  → bot pulls them straight back in (invite-link fallback)
 *   🚫 Nah I'm good   → offer cleared, protection stays armed
 *
 * Exit-method detection lives in handler.js's remove branch:
 *   bot-command kicks → _botKicked marker → skipped before this module
 *   owner UI kicks    → protection cleared → skipped before this module
 *   admin UI kicks    → offerReadd() (this module)
 *   voluntary leaves  → author undefined → no offer, left-tracker notifies owner
 *
 * Offers persist in database/protectionOffers.json (survive restarts),
 * one live offer per (group, member), 7-day TTL.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const database = require('../database');
const { buildComparableIds, normalizeJidWithLid } = require('./jidHelper');
const { onButton } = require('./buttonHelper');

const OFFERS_PATH = path.join(__dirname, '..', 'database', 'protectionOffers.json');
const OFFER_TTL = 7 * 24 * 60 * 60 * 1000;

let offers = {};
try {
  offers = JSON.parse(fs.readFileSync(OFFERS_PATH, 'utf8')) || {};
} catch (e) {}

function save() {
  try {
    fs.mkdirSync(path.dirname(OFFERS_PATH), { recursive: true });
    fs.writeFileSync(OFFERS_PATH, JSON.stringify(offers, null, 2));
  } catch (e) {}
}

const digitsOf = (jid) => String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');

function keyOf(jid) {
  try {
    const n = normalizeJidWithLid(jid);
    if (n) return String(n).split(':')[0];
  } catch (e) {}
  return String(jid || '').split(':')[0];
}

// LID-safe identity check — offer stored from a group event (may be LID jid),
// tap arrives from the member's DM (phone jid). Match via normalized keys,
// digit equality, or digit suffix tolerance.
const sameMember = (a, b) => {
  if (!a || !b) return false;
  const da = digitsOf(keyOf(a));
  const db = digitsOf(keyOf(b));
  if (da && db) {
    if (da === db) return true;
    if (da.endsWith(db) || db.endsWith(da)) return true;
  }
  const ra = digitsOf(a);
  const rb = digitsOf(b);
  return !!(ra && rb && ra === rb);
};

function candidatesFor(jid) {
  const out = [];
  const stripped = String(jid).replace(/:\d+@/, '@');
  if (stripped !== jid) out.push(stripped);
  try {
    const resolved = normalizeJidWithLid(jid);
    if (resolved && resolved !== jid && !out.includes(resolved)) out.push(resolved);
  } catch (e) {}
  for (const v of buildComparableIds(jid)) if (!out.includes(v)) out.push(v);
  if (!out.includes(jid)) out.push(jid);
  return out;
}

async function groupName(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    if (meta && meta.subject) return meta.subject;
  } catch (e) {}
  return 'a group';
}

async function memberInGroup(sock, groupJid, memberJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const variants = buildComparableIds(memberJid);
    const md = digitsOf(memberJid);
    return (meta.participants || []).some((p) => {
      const pid = p.id || p.lid || p.jid;
      if (!pid) return false;
      if (variants.includes(pid)) return true;
      const pd = digitsOf(pid);
      return !!(pd && md && pd === md);
    });
  } catch (e) {}
  return false;
}

async function tryReadd(sock, groupJid, memberJid) {
  // Honest: refused adds resolve without throwing — a 403 used to return
  // true here and the caller sent "WELCOME BACK" for someone still outside.
  const { groupAction } = require('./groupActions');
  const r = await groupAction(sock, groupJid, candidatesFor(memberJid), 'add');
  return r.ok;
}

async function notifyOwner(sock, text, mentionJid) {
  for (const ownerNum of config.ownerNumber || []) {
    try {
      const ownerJid = ownerNum.includes('@') ? ownerNum : `${ownerNum}@s.whatsapp.net`;
      await sock.sendMessage(ownerJid, { text, mentions: mentionJid ? [mentionJid] : undefined });
    } catch (e) {}
  }
}

// ── offer DM — called from handler.js on an admin UI kick ──────────────────
async function offerReadd(sock, groupJid, memberJid, adminJid) {
  const gname = await groupName(sock, groupJid);
  const nonce = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

  // one live offer per (group, member) — a fresh kick replaces the old offer
  for (const [k, o] of Object.entries(offers)) {
    if (o.groupJid === groupJid && sameMember(o.memberJid, memberJid)) delete offers[k];
  }
  offers[nonce] = { groupJid, memberJid, adminJid: adminJid || null, at: Date.now() };
  save();

  try {
    await sock.sendMessage(memberJid, {
      text:
        `🛡️ *PROTECTED MEMBER* 💪\n\n` +
        `An admin just kicked you out of *${gname}*\n` +
        `You're on KAMI's protection list though — I can pull you straight back in\n\n` +
        `Your call:`,
      buttons: [
        { id: `protect:back:${nonce}`, text: '🔄 Bring me back' },
        { id: `protect:pass:${nonce}`, text: "🚫 Nah I'm good" },
      ],
      footer: config.botName || 'KAMI Bot',
    });
    return true;
  } catch (e) {
    console.error('[PROTECTION-DM] offer DM failed:', e.message);
    delete offers[nonce];
    save();
    return false;
  }
}

// ownership check: only the kicked member may tap their own offer
function takeOffer(btnId, sender) {
  const nonce = String(btnId).split(':')[2];
  const offer = offers[nonce];
  if (!offer) return null;
  if (Date.now() - offer.at > OFFER_TTL) {
    delete offers[nonce];
    save();
    return null;
  }
  if (!sameMember(offer.memberJid, sender)) return null;
  return { nonce, ...offer };
}

// ── buttons ─────────────────────────────────────────────────────────────────
onButton('protect:back:', async (sock, msg, from, sender, btnId) => {
  try {
    const offer = takeOffer(btnId, sender);
    if (!offer) {
      await sock.sendMessage(from, { text: `❌ That offer expired — or it's not yours, hey` }, { quoted: msg });
      return;
    }
    delete offers[offer.nonce];
    save();

    // rejoined by other means while the offer sat?
    if (await memberInGroup(sock, offer.groupJid, offer.memberJid)) {
      await sock.sendMessage(from, { text: `✅ You're already back in — no action needed 💪` }, { quoted: msg });
      return;
    }

    const gname = await groupName(sock, offer.groupJid);
    const reAdded = await tryReadd(sock, offer.groupJid, offer.memberJid);

    if (reAdded) {
      // Vouch for the re-add in the join-gate ledger (belt & braces — the
      // add event's author can arrive as the bot's LID and miss the actor check)
      try { require('./joinGate').markBotAdded(offer.groupJid, offer.memberJid, 'protection-offer', 'member-button'); } catch (e) {}
      await sock.sendMessage(from, {
        text:
          `✅ *WELCOME BACK* 💪\n\n` +
          `You're back in *${gname}*\n` +
          `_Nobody kicks KAMI's people without asking first 😤_`,
      }, { quoted: msg });
      database.logProtection({
        action: 'readd-confirmed',
        target: offer.memberJid,
        triggeredBy: 'member-button',
        group: offer.groupJid,
        result: 're-added',
      });
      await notifyOwner(
        sock,
        `🛡️ *PROTECTION* 💀\n\n` +
          `@${digitsOf(offer.memberJid)} accepted the bring-me-back offer\n` +
          `They're back in *${gname}*`,
        offer.memberJid
      );
    } else {
      let inviteLink = '';
      try {
        inviteLink = `https://chat.whatsapp.com/${await sock.groupInviteCode(offer.groupJid)}`;
      } catch (e) {}
      await sock.sendMessage(from, {
        text:
          `😅 *COULDN'T ADD YOU DIRECTLY*\n\n` +
          `WhatsApp blocked the pull-back — their privacy settings or I'm not admin\n\n` +
          (inviteLink
            ? `🔗 *Jump back in here:*\n${inviteLink}\n\nOnce you're back you're protected again`
            : `Ask KAMI to pull you back in, hey`),
      }, { quoted: msg });
      database.logProtection({
        action: 'readd-confirmed',
        target: offer.memberJid,
        triggeredBy: 'member-button',
        group: offer.groupJid,
        result: inviteLink ? 'invite-sent' : 'failed',
      });
    }
  } catch (e) {
    console.error('[PROTECTION-DM] bring-me-back failed:', e.message);
  }
});

onButton('protect:pass:', async (sock, msg, from, sender, btnId) => {
  try {
    const offer = takeOffer(btnId, sender);
    if (!offer) {
      await sock.sendMessage(from, { text: `❌ That offer expired — or it's not yours, hey` }, { quoted: msg });
      return;
    }
    delete offers[offer.nonce];
    save();
    await sock.sendMessage(from, {
      text:
        `✅ *ALL GOOD* 💪\n\n` +
        `You're staying out of it — your protection stays armed though\n` +
        `_If you ever want back in, hit KAMI up_`,
    }, { quoted: msg });
    database.logProtection({
      action: 'readd-declined',
      target: offer.memberJid,
      triggeredBy: 'member-button',
      group: offer.groupJid,
      result: 'declined',
    });
  } catch (e) {
    console.error('[PROTECTION-DM] pass failed:', e.message);
  }
});

module.exports = { offerReadd, takeOffer, candidatesFor, sameMember, groupName };

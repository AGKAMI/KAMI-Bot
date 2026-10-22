/**
 * Crew helpers — shared functions for crew commands
 */

const config = require('../../config');
const { todayISO } = require('./cpmData');

// Invisible/bidi marks + fullwidth forms that ride along when a phone
// number is pasted (contacts, old chats, multilingual keyboards). The
// strict phone-token regex below rejects a token containing ANY of these
// — the target then silently resolved to nobody and `!crew apply` fell
// back to self-apply ("You're already in …" about the SENDER). Strip and
// normalize BEFORE any token testing.
const PHONE_JUNK_RE = /[\u200B-\u200F\u202A-\u202E\u061C\uFEFF\u2060-\u2064\u180E]/g;
const PHONE_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const PHONE_TOKEN_RE = /^[\d+\s()-]+$/;

function cleanPhoneToken(t) {
  return String(t || '')
    .replace(PHONE_JUNK_RE, '')
    .replace(/[\uFF0B\uFE62]/g, '+')                       // fullwidth/small plus
    .replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30)) // fullwidth digits
    .replace(PHONE_SPACE_RE, ' ');
}

// Convert phone number to WhatsApp JID
function phoneToJid(phone) {
  if (!phone) return null;
  if (phone.includes('@s.whatsapp.net')) return phone;
  let digits = cleanPhoneToken(phone).replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = (config.defaultCountryCode || '27') + digits.slice(1);
  }
  if (digits.length < 10) return null;
  return digits + '@s.whatsapp.net';
}

// Resolve user from @mention, phone number or reply — in that order.
// Explicit beats implicit: a typed number or a tag always wins over the
// reply context, so `.apply kssmp 077 158 6969` while replying to some
// other message still targets the NUMBER (reply used to shadow it and
// silently apply for whoever was quoted instead).
function resolveUser(args, mentionedJid, contextInfo) {
  // Method 1: @mention (explicit tag)
  if (mentionedJid && mentionedJid.length > 0) {
    // WhatsApp keeps the raw "@123456" token in the message text — strip
    // leading mention tokens so they never leak into role names
    // (`.crew role @user Constable` used to store "@123456 Constable")
    const rest = [...args];
    while (rest.length && /^@\d{4,}$/.test(rest[0])) rest.shift();
    return { jid: mentionedJid[0], args: rest, method: 'mention' };
  }
  // Method 2: phone number (may be split across multiple args like +27 64 841 5504)
  // Tokens are cleaned of invisible marks FIRST — a pasted "+27…" often
  // carries bidi/LRM junk that used to fail the regex and drop the target.
  if (args.length > 0) {
    const cleaned = args.map(cleanPhoneToken);
    if (PHONE_TOKEN_RE.test(cleaned[0])) {
      let phoneParts = [];
      let roleIdx = 0;
      for (let i = 0; i < cleaned.length; i++) {
        if (PHONE_TOKEN_RE.test(cleaned[i]) && /\d/.test(cleaned[i])) {
          phoneParts.push(cleaned[i]);
          roleIdx = i + 1;
        } else {
          break;
        }
      }
      const fullPhone = phoneParts.join(' ');
      const jid = phoneToJid(fullPhone);
      if (jid) {
        return { jid, args: args.slice(roleIdx), method: 'phone' };
      }
      return { jid: null, error: 'invalid_phone' };
    }
  }
  // Method 3: reply context (implicit — only when nothing explicit given)
  if (contextInfo?.participant) {
    return { jid: contextInfo.participant, args, method: 'reply' };
  }
  return { jid: null, args, method: 'none' };
}

// Shared upcoming-event sort — THE one copy (events.js and attend.js used
// to duplicate this with a "keep both in sync" apology comment). Sorts by
// (eventDate, time) so next week's meet never floats above tomorrow's;
// legacy no-date records sort as today (their original behavior). Timeless
// v2 events (time skipped = "starting now") sort FIRST within their day via
// the '00:00' fallback; `String()` guards v2 records that store time: null
// — the old `evt.time.split` threw a TypeError on those. Missing status =
// upcoming (events written before status was persisted).
const sortUpcoming = (allEvents) => Object.entries(allEvents || {})
  .filter(([, evt]) => !evt.status || evt.status === 'upcoming')
  .sort((a, b) => {
    const dateA = a[1].eventDate || todayISO();
    const dateB = b[1].eventDate || todayISO();
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    const timeA = String(a[1].time || '00:00').split(':').map(Number);
    const timeB = String(b[1].time || '00:00').split(':').map(Number);
    return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
  });

module.exports = { phoneToJid, resolveUser, sortUpcoming };

/**
 * Crew helpers — shared functions for crew commands
 */

const config = require('../../config');

// Convert phone number to WhatsApp JID
function phoneToJid(phone) {
  if (!phone) return null;
  if (phone.includes('@s.whatsapp.net')) return phone;
  let digits = phone.replace(/\D/g, '');
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
    return { jid: mentionedJid[0], args, method: 'mention' };
  }
  // Method 2: phone number (may be split across multiple args like +27 64 841 5504)
  if (args.length > 0 && /^[\d+\s()-]+$/.test(args[0])) {
    let phoneParts = [];
    let roleIdx = 0;
    for (let i = 0; i < args.length; i++) {
      if (/^[\d+\s()-]+$/.test(args[i])) {
        phoneParts.push(args[i]);
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
  // Method 3: reply context (implicit — only when nothing explicit given)
  if (contextInfo?.participant) {
    return { jid: contextInfo.participant, args, method: 'reply' };
  }
  return { jid: null, args, method: 'none' };
}

module.exports = { phoneToJid, resolveUser };

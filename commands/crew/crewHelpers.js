/**
 * Crew helpers — shared functions for crew commands
 */

// Convert phone number to WhatsApp JID
function phoneToJid(phone) {
  if (!phone) return null;
  if (phone.includes('@s.whatsapp.net')) return phone;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = '27' + digits.slice(1);
  }
  if (digits.length < 10) return null;
  return digits + '@s.whatsapp.net';
}

// Resolve user from @mention or phone number
function resolveUser(args, mentionedJid) {
  // Method 1: @mention
  if (mentionedJid && mentionedJid.length > 0) {
    return { jid: mentionedJid[0], args, method: 'mention' };
  }
  // Method 2: phone number
  if (args.length > 0 && /^[\d+\s()-]+$/.test(args[0])) {
    const jid = phoneToJid(args[0]);
    if (jid) {
      return { jid, args: args.slice(1), method: 'phone' };
    }
    return { jid: null, error: 'invalid_phone' };
  }
  return { jid: null, args, method: 'none' };
}

module.exports = { phoneToJid, resolveUser };

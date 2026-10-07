/**
 * JID Helper Utilities for LID-aware matching
 * Shared by promote, demote, and other commands
 */

const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// LID mapping cache
const lidMappingCache = new Map();

// Get LID mapping value from files
const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) {
    return lidMappingCache.get(cacheKey);
  }
  
  const sessionPath = path.join(__dirname, '..', config.sessionName || 'session');
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
  
  if (!fs.existsSync(filePath)) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
  
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || null);
    return value || null;
  } catch (error) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
};

// Normalize JID handling LID conversion
const normalizeJidWithLid = (jid) => {
  if (!jid) return jid;
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
    }
    
    let user = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    const mapToPn = () => {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) {
        user = pnUser;
        server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        return true;
      }
      return false;
    };
    
    if (server === 'lid' || server === 'hosted.lid') {
      mapToPn();
    } else if (server === 's.whatsapp.net' || server === 'hosted') {
      mapToPn();
    }
    
    if (server === 'hosted') {
      return jidEncode(user, 'hosted');
    }
    return jidEncode(user, 's.whatsapp.net');
  } catch (error) {
    return jid;
  }
};

// Build comparable JID variants (PN + LID) for matching
const buildComparableIds = (jid) => {
  if (!jid) return [];
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return [normalizeJidWithLid(jid)].filter(Boolean);
    }
    
    const variants = new Set();
    const normalizedServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    variants.add(jidEncode(decoded.user, normalizedServer));
    
    const isPnServer = normalizedServer === 's.whatsapp.net' || normalizedServer === 'hosted';
    const isLidServer = normalizedServer === 'lid' || normalizedServer === 'hosted.lid';
    
    if (isPnServer) {
      const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
      if (lidUser) {
        const lidServer = normalizedServer === 'hosted' ? 'hosted.lid' : 'lid';
        variants.add(jidEncode(lidUser, lidServer));
      }
    } else if (isLidServer) {
      const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
      if (pnUser) {
        const pnServer = normalizedServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        variants.add(jidEncode(pnUser, pnServer));
      }
    }
    
    return Array.from(variants);
  } catch (error) {
    return [jid];
  }
};

// Find participant by either PN JID or LID JID
const findParticipant = (participants = [], userIds) => {
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .flatMap(id => buildComparableIds(id));
  
  if (!targets.length) return null;
  
  return participants.find(participant => {
    if (!participant) return false;
    
    const participantIds = [
      participant.id,
      participant.lid,
      participant.userJid
    ]
      .filter(Boolean)
      .flatMap(id => buildComparableIds(id));
    
    return participantIds.some(id => targets.includes(id));
  }) || null;
};

const clearLidCache = () => lidMappingCache.clear();

// All jids worth trying for a given id — mentions sometimes arrive as LID
// digits on the @s.whatsapp.net server, which updateBlockStatus can't resolve
const candidateJids = (jid) => {
  if (!jid || typeof jid !== 'string') return [];
  const out = [];
  const push = (v) => { if (v && typeof v === 'string' && !out.includes(v)) out.push(v); };

  let user;
  try { user = jidDecode(jid)?.user; } catch (e) { user = null; }
  if (!user) user = jid.split('@')[0].split(':')[0];
  if (!user) return [jid];

  const pnOfLid = getLidMappingValue(user, 'lidToPn'); // user is a LID
  const lidOfPn = getLidMappingValue(user, 'pnToLid'); // user is a phone number

  push(normalizeJidWithLid(jid)); // best guess: the real PN jid
  push(jid);                      // as given

  if (pnOfLid) {
    push(jidEncode(user, 'lid'));
    push(jidEncode(pnOfLid, 's.whatsapp.net'));
  } else if (lidOfPn) {
    push(jidEncode(user, 's.whatsapp.net'));
    push(jidEncode(lidOfPn, 'lid'));
  } else {
    // identity unknown — same digits on both servers
    push(jidEncode(user, 's.whatsapp.net'));
    push(jidEncode(user, 'lid'));
  }
  return out;
};

// PN jid for display/mentions (falls back to the jid as given)
const mentionJid = (jid) => {
  try {
    const user = jidDecode(jid)?.user;
    if (!user) return jid;
    const pn = getLidMappingValue(user, 'lidToPn') || (getLidMappingValue(user, 'pnToLid') ? user : null);
    if (pn) return jidEncode(pn, 's.whatsapp.net');
  } catch (e) { /* fall through */ }
  return jid;
};

// updateBlockStatus across PN/LID variants — returns the jid that worked
const updateBlockStatusSafe = async (sock, jid, action) => {
  let lastError = null;
  for (const candidate of candidateJids(jid)) {
    try {
      await sock.updateBlockStatus(candidate, action);
      return candidate;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('could not resolve a usable jid');
};

// Log delivery status for an outgoing DM. A resolved sendMessage only means
// WhatsApp ACCEPTED it — it says nothing about delivery, so the panel console
// gets a line per ack: 2 = server, 3 = delivered to their phone, 4 = read, and
// "still pending" = accepted but never delivered (they blocked the bot, or
// WhatsApp filtered it to Message requests).
const trackSendAck = (sock, sentKey, label) => {
  if (!sock || !sock.ev || !sentKey || !sentKey.id) return;
  const NAMES = { 0: 'ERROR', 1: 'pending', 2: 'sent(server)', 3: 'DELIVERED', 4: 'READ' };
  let settled = false;
  const onUpdate = (updates) => {
    for (const u of updates || []) {
      if (!u || !u.key || u.key.id !== sentKey.id) continue;
      if (u.update && u.update.error) {
        console.log(`[${label}] DM ack ERROR to ${sentKey.remoteJid}:`, u.update.error.message || u.update.error);
        settled = true;
        sock.ev.off('messages.update', onUpdate);
        continue;
      }
      const s = u.update ? u.update.status : undefined;
      if (s === undefined) continue;
      console.log(`[${label}] DM ack status=${s} (${NAMES[s] || '?'}) to ${sentKey.remoteJid}`);
      if (s === 0 || s >= 3) {
        settled = true;
        sock.ev.off('messages.update', onUpdate);
      }
    }
  };
  sock.ev.on('messages.update', onUpdate);
  setTimeout(() => {
    if (!settled) {
      console.log(`[${label}] DM still pending after 60s to ${sentKey.remoteJid} — accepted but never delivered (blocked by them / filtered?)`);
    }
    sock.ev.off('messages.update', onUpdate);
  }, 60000);
};

module.exports = {
  findParticipant,
  buildComparableIds,
  normalizeJidWithLid,
  getLidMappingValue,
  clearLidCache,
  candidateJids,
  mentionJid,
  updateBlockStatusSafe,
  trackSendAck
};


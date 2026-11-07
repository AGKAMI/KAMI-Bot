/**
 * Crew presence guard — verifies a person is ACTUALLY in a WhatsApp crew group
 * before any command acts on crew DB data.
 *
 * The crew DB (database/crew.json) is synced from WhatsApp groups every 30 min
 * by syncCrewRosters() in index.js. Between syncs it can be stale:
 *   - Someone leaves the group → DB still has them (until next sync)
 *   - .crew accept writes to DB but groupParticipantsUpdate fails (403 privacy)
 *     → DB says "in crew", WhatsApp says "not in group"
 *
 * Commands that block users based on crew DB reads MUST verify real-time
 * group presence first, otherwise they reject people who should be able to
 * apply/promote/demote/etc.
 */
const { buildComparableIds } = require('./jidHelper');

/**
 * Check if a JID is actually present in a WhatsApp group right now.
 * Variant-aware: matches PN ↔ LID ↔ device-suffix forms.
 *
 * @param {object} sock - Baileys socket (for groupMetadata)
 * @param {string} groupJid - crew group JID (@g.us)
 * @param {string} applicantJid - person to check
 * @returns {Promise<boolean>} true if they're in the group right now
 */
async function isPersonInCrewGroup(sock, groupJid, applicantJid) {
  if (!groupJid || !applicantJid) return false;
  try {
    const meta = await sock.groupMetadata(groupJid).catch(() => null);
    if (!meta || !meta.participants) return false;
    const targets = buildComparableIds(applicantJid);
    return meta.participants.some(p => targets.includes(p.id));
  } catch (e) {
    return false;
  }
}

module.exports = { isPersonInCrewGroup };

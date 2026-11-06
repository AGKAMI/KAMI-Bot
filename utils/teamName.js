/**
 * Team display-name resolver — outputs full group names instead of abbreviations.
 * Live group subject (when provided) → config crewTeams name → the input itself.
 */

const config = require('../config');

const getTeamDisplayName = (teamKeyOrJid, subject = null) => {
  if (subject) return subject;
  if (!teamKeyOrJid) return 'Unknown';
  const teams = config.crewTeams || {};
  if (teams[teamKeyOrJid]?.name) return teams[teamKeyOrJid].name;
  const byJid = Object.values(teams).find(t => t.jid === teamKeyOrJid);
  if (byJid?.name) return byJid.name;
  return teamKeyOrJid;
};

/**
 * Get emoji for a crew role based on its position in the roles array.
 * First role = 👤, second-to-last = ⭐, last = 👑, everything else = 🎖️
 */
const getRoleEmoji = (role, roles) => {
  if (!roles || !roles.length) return '🎖️';
  const idx = roles.indexOf(role);
  if (idx === -1) return '🎖️';
  if (idx === roles.length - 1) return '👑';
  if (idx === roles.length - 2) return '⭐';
  if (idx === 0) return '👤';
  return '🎖️';
};

module.exports = { getTeamDisplayName, getRoleEmoji };

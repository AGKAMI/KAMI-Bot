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

module.exports = { getTeamDisplayName };

/**
 * Shared crew application logic — used by both !crew apply and !start button flow.
 */

const database = require('../../database');
const config = require('../../config');
const { TEAMS } = require('./crewForms');
const { buildComparableIds } = require('../../utils/jidHelper');
const { getTeamDisplayName } = require('../../utils/teamName');
const { pick, SLANG, mention } = require('../../utils/format');

/**
 * Create a crew application and DM the applicant the form.
 * @param {object} sock - Baileys socket
 * @param {string} applicantJid - who is applying
 * @param {string} teamKey - SSRS, KSSPS, KSSMP, KSSMS
 * @param {object} opts - { replyFn, from, applyingForSomeone }
 * @returns {{ ok: boolean, app?: object, error?: string }}
 */
async function createApplication(sock, applicantJid, teamKey, opts = {}) {
  const { replyFn, from, applyingForSomeone = false } = opts;
  const teamGroupJid = config.crewTeams[teamKey].jid;

  // 1. Already in the crew DB for this team? (checks PN + LID variants so a
  // LID-resolved applicant matches their rostered phone entry too)
  const memberVariants = buildComparableIds(applicantJid);
  const member = database.getCrewMember(teamGroupJid, applicantJid)
    || memberVariants.map(v => database.getCrewMember(teamGroupJid, v)).find(Boolean);
  if (member) {
    const roleTxt = member.role ? ` as *${member.role}*` : '';
    let whenTxt = '';
    if (member.joined) {
      try {
        whenTxt = `, joined ${new Date(member.joined).toLocaleDateString('en-ZA', {
          timeZone: config.timezone || 'Africa/Johannesburg',
        })}`;
      } catch (e) { /* date formatting is best-effort */ }
    }
    const msg = applyingForSomeone
      ? `❌ ERROR\n\n${mention(applicantJid)} is already in ${TEAMS[teamKey].label}${roleTxt}${whenTxt}, hey`
      : `❌ ERROR\n\nYou're already in ${TEAMS[teamKey].label}${roleTxt}${whenTxt}, boet\n\n` +
        `_Wrong entry? Ask KAMI to take it off._`;
    if (replyFn) await replyFn(msg);
    return { ok: false, error: 'already_in_crew' };
  }

  // 2. Already a participant in the team's WhatsApp group?
  try {
    const meta = await sock.groupMetadata(teamGroupJid).catch(() => null);
    if (meta && meta.participants) {
      const alreadyIn = meta.participants.some(p =>
        p.id === applicantJid ||
        p.id?.split('@')[0] === applicantJid.split('@')[0]
      );
      if (alreadyIn) {
        const teamName = getTeamDisplayName(teamKey);
        const msg = applyingForSomeone
          ? `❌ ERROR\n\n${mention(applicantJid)} is already chilling in the ${teamName} group 🤨`
          : `❌ ERROR\n\nYou're already in the ${teamName} group, ne 🤨`;
        if (replyFn) await replyFn(msg);
        return { ok: false, error: 'already_in_group' };
      }
    }
  } catch (e) {}

  // 3. Duplicate pending application?
  const existingApps = database.getApplicants(teamGroupJid);
  const applicantVariants = buildComparableIds(applicantJid);
  const dup = Object.values(existingApps).find(a =>
    a.status === 'pending' && buildComparableIds(a.jid).some(v => applicantVariants.includes(v))
  );
  if (dup) {
    if (!dup.answers) {
      // Broken app — allow re-apply
      database.removeApplicant(teamGroupJid, dup.appUid);
    } else {
      const teamName = getTeamDisplayName(teamKey);
      const msg = applyingForSomeone
        ? `❌ ERROR\n\n${mention(applicantJid)} already has a ${teamName} application waiting\nApp ID: *${dup.appUid}*`
        : `❌ ERROR\n\nYou've already got a ${teamName} application in\nApp ID: *${dup.appUid}*`;
      if (replyFn) await replyFn(msg);
      return { ok: false, error: 'duplicate_pending' };
    }
  }

  // 4. Create application in DB
  const app = database.addApplicant(teamGroupJid, applicantJid, {
    team: teamKey,
    answers: null,
  });
  if (!app) {
    if (replyFn) await replyFn(`❌ ERROR\n\nCouldn't create application`);
    return { ok: false, error: 'db_error' };
  }

  // 5. Unblock applicant so DM lands
  try {
    await sock.updateBlockStatus(applicantJid, 'unblock');
  } catch (e) {}

  // 6. DM applicant with form + auto-start wizard
  try {
    await sock.sendMessage(applicantJid, {
      text:
        `━━━━━━━━━━━━━━━━\n` +
        `*${TEAMS[teamKey].label.toUpperCase()} APPLICATION*\n` +
        `${TEAMS[teamKey].emoji} ${TEAMS[teamKey].role.toUpperCase()} ${TEAMS[teamKey].emoji}\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `🆔 *YOUR APPLICATION ID:* ${app.appUid}\n\n` +
        `Starting your application wizard... 🔘`,
    });

    // Auto-start the interactive button wizard
    const { startWizard } = require('./applyInteractive');
    await startWizard(sock, applicantJid, teamKey, app.appUid, applicantJid, applyingForSomeone, applicantJid);
  } catch (dmErr) {
    console.error('[CREW APPLY] form DM failed:', dmErr.message);
    database.removeApplicant(teamGroupJid, app.appUid);
    const msg = applyingForSomeone
      ? `❌ ERROR\n\nCouldn't DM ${mention(applicantJid)} the form, shame\n\n` +
        `They've probably blocked the bot, or their privacy settings are stopping DMs.\n\n` +
        `💡 *What to do:*\n` +
        `• Get them to message the bot first (${config.prefix || '.'}start)\n` +
        `• Or let them unblock the bot and try again\n` +
        `• Or use ${config.prefix || '.'}crew apply ${teamKey} so they apply themselves`
      : `❌ ERROR\n\nCouldn't DM you the form\nCheck if DMs are open from this bot, hey`;
    if (replyFn) await replyFn(msg);
    return { ok: false, error: 'dm_failed' };
  }

  return { ok: true, app };
}

/**
 * Check if a user is already in a crew team (by JID).
 * Returns the team key if found, null otherwise.
 */
function getUserTeam(applicantJid) {
  const crewTeams = config.crewTeams || {};
  for (const [key, team] of Object.entries(crewTeams)) {
    if (key === 'SSGENERAL') continue;
    if (database.getCrewMember(team.jid, applicantJid)) {
      return key;
    }
  }
  return null;
}

/**
 * Check if user has a pending application for any team.
 * Returns the team key if found, null otherwise.
 */
function getUserPendingTeam(applicantJid) {
  const crewTeams = config.crewTeams || {};
  const inputVariants = buildComparableIds(applicantJid);
  for (const [key, team] of Object.entries(crewTeams)) {
    if (key === 'SSGENERAL') continue;
    const apps = database.getApplicants(team.jid);
    const hasPending = Object.values(apps).some(a =>
      a.status === 'pending' && buildComparableIds(a.jid).some(v => inputVariants.includes(v))
    );
    if (hasPending) return key;
  }
  return null;
}

module.exports = { createApplication, getUserTeam, getUserPendingTeam };

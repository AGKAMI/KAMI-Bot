/**
 * Shared crew application logic — used by both !crew apply and !start button flow.
 */

const database = require('../../database');
const config = require('../../config');
const { TEAMS } = require('./crewForms');
const { buildComparableIds } = require('../../utils/jidHelper');
const { sendButtons } = require('../../utils/buttonHelper');
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

  // 1. Already in the crew DB for this team?
  if (database.getCrewMember(teamGroupJid, applicantJid)) {
    const msg = applyingForSomeone
      ? `❌ ERROR\n\n${mention(applicantJid)} is already part of ${TEAMS[teamKey].label}`
      : `❌ ERROR\n\nYou're already part of ${TEAMS[teamKey].label}`;
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
        const msg = applyingForSomeone
          ? `❌ ERROR\n\n${mention(applicantJid)} is already in the ${teamKey} group 🤨`
          : `❌ ERROR\n\nYou're already in the ${teamKey} group 🤨`;
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
      const msg = applyingForSomeone
        ? `❌ ERROR\n\n${mention(applicantJid)} already has a pending ${teamKey} application\nApp ID: *${dup.appUid}*`
        : `❌ ERROR\n\nYou already have a pending ${teamKey} application\nApp ID: *${dup.appUid}*`;
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

  // 6. DM applicant with form
  try {
    await sendButtons(sock, applicantJid, {
      text:
        `━━━━━━━━━━━━━━━━\n` +
        `*${TEAMS[teamKey].label.toUpperCase()} APPLICATION*\n` +
        `${TEAMS[teamKey].emoji} ${TEAMS[teamKey].role.toUpperCase()} ${TEAMS[teamKey].emoji}\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `🆔 *YOUR APPLICATION ID:* ${app.appUid}\n\n` +
        `How would you like to answer the questions?`,
      footer: `${teamKey} Application`,
      buttons: [
        { id: `cwiz:choice:btn:${teamKey}:${app.appUid}`, text: '🔘 Use Buttons' },
        { id: `cwiz:choice:txt:${teamKey}:${app.appUid}`, text: '✍️ Type Answers' },
      ],
    });
  } catch (dmErr) {
    console.error('[CREW APPLY] form DM failed:', dmErr.message);
    database.removeApplicant(teamGroupJid, app.appUid);
    const msg = applyingForSomeone
      ? `❌ ERROR\n\nCouldn't DM ${mention(applicantJid)} the application form\nCheck if they have DMs open from this bot`
      : `❌ ERROR\n\nCouldn't DM you the application form\nCheck if you have DMs open from this bot`;
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

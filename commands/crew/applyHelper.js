/**
 * Shared crew application logic — used by both !crew apply and !start button flow.
 */

const database = require('../../database');
const config = require('../../config');
const { TEAMS } = require('./crewForms');
const { buildComparableIds } = require('../../utils/jidHelper');
const { getTeamDisplayName } = require('../../utils/teamName');
const { pick, SLANG, mention } = require('../../utils/format');
const { logJidResolution, logDbChange, logError } = require('../../utils/botLogger');

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

  // Log JID resolution for agent debugging — traces why a JID matched (or
  // didn't match) a crew member, which is key to debugging false-positive
  // "already in crew" reports for numbers not on WhatsApp.
  try { logJidResolution(applicantJid, applicantJid, memberVariants, 'none', 'apply.createApplication.crewCheck'); } catch (e) {}

  const matchedMember = database.getCrewMemberAnyVariant(teamGroupJid, applicantJid);
  const matchedKey = matchedMember ? matchedMember.originalJid || applicantJid : null;

  // Diagnostics: which variant matched, and what was stored originally
  if (matchedMember) {
    const matchedVariant = memberVariants.find(v =>
      database.getCrewMember(teamGroupJid, v) !== null
    );
    try { logJidResolution(applicantJid, matchedKey, memberVariants,
      `variant=${matchedVariant || 'unknown'} storedAs=${matchedMember.originalJid || 'unknown'}`, 'apply.createApplication.crewCheck'); } catch (e) {}
    try { logError(new Error('CREW_CHECK_FALSE_POSITIVE_RISK'), {
      command: 'apply.createApplication',
      step: 'crewCheck',
      inputJid: applicantJid,
      matchedVariant,
      storedOriginalJid: matchedMember.originalJid,
      matchedMemberRole: matchedMember.role,
      matchedMemberJoined: matchedMember.joined,
      teamKey,
      teamGroupJid,
      allVariants: memberVariants,
      note: 'Number may not be on WhatsApp — stale LID/PN variant match possible',
    }); } catch (e) {}
  }
  if (matchedMember) {
    let whenTxt = '';
    if (matchedMember.joined) {
      try {
        whenTxt = `, joined ${new Date(matchedMember.joined).toLocaleDateString('en-ZA', {
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
    try { logJidResolution(applicantJid, dup.jid, applicantVariants,
      'variant', 'apply.createApplication.duplicateCheck'); } catch (e) {}
    if (!dup.answers) {
      // Broken app — allow re-apply
      try { database.removeApplicant(teamGroupJid, dup.appUid); } catch (e) {
        console.error('[APPLY] removeApplicant duplicate failed:', e.message);
      }
      try { logDbChange('applicant', 'remove', dup.appUid, teamKey, { status: 'pending', appUid: dup.appUid }, null, 'bot'); } catch (e) {}
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
  let appResult;
  try {
    appResult = database.addApplicant(teamGroupJid, applicantJid, {
      team: teamKey,
      answers: null,
    });
  } catch (e) {
    console.error('[APPLY] addApplicant failed:', e.message);
    if (replyFn) await replyFn(`❌ ERROR\n\nCouldn't create application`);
    return { ok: false, error: 'db_error' };
  }
  if (!appResult.ok) {
    if (appResult.error === 'duplicate_pending') {
      const teamName = getTeamDisplayName(teamKey);
      const msg = applyingForSomeone
        ? `❌ ERROR\n\n${mention(applicantJid)} already has a ${teamName} application waiting\nApp ID: *${appResult.existing.appUid}*`
        : `❌ ERROR\n\nYou've already got a ${teamName} application in\nApp ID: *${appResult.existing.appUid}*`;
      if (replyFn) await replyFn(msg);
      return { ok: false, error: 'duplicate_pending' };
    }
    if (replyFn) await replyFn(`❌ ERROR\n\nCouldn't create application`);
    return { ok: false, error: 'db_error' };
  }
  const app = appResult.app;
  try { logDbChange('applicant', 'create', applicantJid, teamKey, null, { appUid: app.appUid, team: teamKey, status: 'pending' }, 'bot'); } catch (e) {}

  // 5. Unblock applicant so DM lands — PN/LID variants via Safe (a raw call
  // only tries one jid form and can silently miss). A failed unblock means
  // the form DM below can't arrive, so it's logged loudly, never swallowed.
  try {
    const { updateBlockStatusSafe } = require('../../utils/jidHelper');
    await updateBlockStatusSafe(sock, applicantJid, 'unblock');
  } catch (e) {
    console.error('[CREW APPLY] unblock failed for', applicantJid, '—', e.message);
  }

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
    try { logError(dmErr, { command: 'apply.createApplication', jid: applicantJid, teamKey, step: 'form_dm' }); } catch (e) {}
    database.removeApplicant(teamGroupJid, app.appUid);
    try { logDbChange('applicant', 'remove', app.appUid, teamKey, { status: 'pending', appUid: app.appUid }, null, 'bot'); } catch (e) {}
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

  try { logDbChange('applicant', 'status_change', app.appUid, teamKey, { status: 'pending' }, { status: 'pending', appUid: app.appUid, answers: null, team: teamKey }, 'bot'); } catch (e) {}

  return { ok: true, app };
}

/**
 * Check if a user is already in a crew team (by JID).
 * Returns the team key if found, null otherwise.
 */
function getUserTeam(applicantJid) {
  const crewTeams = config.crewTeams || {};
  const inputVariants = buildComparableIds(applicantJid);
  for (const [key, team] of Object.entries(crewTeams)) {
    if (key === 'SSGENERAL') continue;
    // Roster keys may be PN *or* LID jids — match across variants
    const member = database.getCrewMember(team.jid, applicantJid)
      || inputVariants.map(v => database.getCrewMember(team.jid, v)).find(Boolean);
    if (member) {
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

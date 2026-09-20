/**
 * Crew forms — shared team definitions, application question banks,
 * and hired / not-hired message builders for the .crew apply flow.
 */

const config = require('../../config');

// Team metadata: display name + emoji theme. Group JID + invite live in config.crewTeams.
const TEAMS = {
  'SSRS':      { label: 'Royal Security',    emoji: '🟢🔵🟡', theme: 'GOOD LUCK',      role: 'VIP Event Security' },
  'KSSPS':     { label: 'Private Security',  emoji: '⚫🔴⚪', theme: 'STAY LOCKED IN',  role: 'Close Protection' },
  'KSSMP':     { label: 'Metro Police',      emoji: '🔵⚪🩵', theme: 'RIDE CLEAN',      role: 'Patrol Unit — Metro Police' },
  'KSSMS':     { label: 'Maganyeni Security',emoji: '⚫⚪🔴', theme: 'HOLD IT DOWN',    role: 'Management Squad' },
};

// Returns the 6 application questions for a team (adapted to team role).
const getQuestions = (teamKey) => {
  const base = [
    ['ACTIVITY', 'How many hours per day do you play CPM?'],
    ['AGE', 'How old are you?'],
    ['EXPERIENCE', teamKey === 'KSSPS'
      ? 'Have you done private security or close protection in CPM before?'
      : teamKey === 'KSSMS'
        ? 'Have you managed security teams or coordinated operations in CPM?'
        : teamKey === 'KSSMP'
          ? 'Have you done law enforcement or patrol work in CPM?'
          : 'Have you done security/VIP work in CPM before?'],
    ['LOYALTY', teamKey === 'KSSPS'
      ? 'Will you follow direct orders from |SS| KAMI without hesitation?'
      : teamKey === 'KSSMS'
        ? 'Will you put SS interests above all else?'
        : 'Will you prioritize SS events over other crews?'],
    ['COMMUNICATION', teamKey === 'KSSMP'
      ? 'Can you respond quickly to security alerts on WhatsApp?'
      : 'Are you active on WhatsApp daily?'],
    ['SCENARIO', teamKey === 'KSSPS'
      ? 'A player is following |SS| KAMI aggressively during a meet. What do you do?'
      : teamKey === 'KSSMS'
        ? 'Two security team members are conflicting during an operation. How do you handle it?'
        : teamKey === 'KSSMP'
          ? 'A player is speeding through a restricted zone during an event. What do you do?'
          : 'A VIP car gets rammed during an event. What do you do?']
  ];
  return base.map(([name, q], i) => `${['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'][i]} ${['⏱️','🎂','🎯','🔰','📲','🚨'][i]} *${name}* — ${q}`);
};

// Build the application form sent to the applicant in DMS
const buildFormMessage = (teamKey) => {
  const team = TEAMS[teamKey];
  const crewTeam = config.crewTeams[teamKey];
  const questions = getQuestions(teamKey).join('\n\n');
  return `━━━━━━━━━━━━━━━━\n` +
    `*${team.label.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `_${teamKey} APPLICATION_\n` +
    `${team.emoji} ${team.role.toUpperCase()} ${team.emoji}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `*Send all answers in ONE message. Do not send each answer separately.*\n\n` +
    `${questions}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✍️ *HOW TO SUBMIT:*\n` +
    `Go to any Slammed Society group and reply:\n` +
    `*${'.'}crew applied ${teamKey} <your answer here>*\n\n` +
    `Example:\n` +
    `${'.'}crew applied ${teamKey} 1) 3 hours 2) 18 3) yes did vip before 4) yes 5) active 6) i move the vip to safe zone\n\n` +
    (crewTeam ? `You'll get an application ID to track it. ` : ``) +
    `_${pickGood()}, good luck with the tryout!_`;
};

// Build the "hired" DM message (sent to applicant on accept) with group invite
const buildHiredMessage = (teamKey, inviteLink) => {
  const team = TEAMS[teamKey];
  return `━━━━━━━━━━━━━━━━\n` +
    `*${team.label.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `_${teamKey} APPLICATION REVIEW_\n` +
    `${team.emoji} ${team.role.toUpperCase()} ${team.emoji}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ *STATUS: HIRED*\n\n` +
    `🎉 *WELCOME TO THE ${team.role.split('—')[0].trim().toUpperCase()}*\n\n` +
    `You've been accepted into ${team.label} ${team.emoji}\n\n` +
    `🔰 Your role: *${team.role}*\n` +
    `📲 Report to: *|SS| KAMI*\n` +
    `⚡ Follow all SS rules.\n\n` +
    (inviteLink ? `🔗 *JOIN THE GROUP:*\n${inviteLink}\n\n` : ``) +
    `_${pickGood()}, stay locked in!_`;
};

// Build the "not hired" DM message (sent to applicant on deny)
const buildDeniedMessage = (teamKey, reason) => {
  const team = TEAMS[teamKey];
  return `━━━━━━━━━━━━━━━━\n` +
    `*${team.label.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `_${teamKey} APPLICATION REVIEW_\n` +
    `${team.emoji} ${team.role.toUpperCase()} ${team.emoji}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `❌ *STATUS: NOT SELECTED*\n\n` +
    `💬 *WHY?*\n${reason || 'No reason given'}\n\n` +
    `🔄 *WHAT NOW:*\nYou can reapply after *7 days*. Use that time to get more CPM experience and prove your loyalty to SS.\n\n` +
    `_Don't take it personal, yazi. Keep grinding._ 💪`;
};

// Build the pending-application notice sent to the team's group admins
const buildAdminNotice = (app) => {
  const team = TEAMS[app.team];
  const num = app.jid ? app.jid.split('@')[0] : 'unknown';
  return `━━━━━━━━━━━━━━━━\n` +
    `*NEW ${app.team} APPLICATION* ${team ? team.emoji : ''}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🆔 *App ID:* ${app.appUid}\n` +
    `👤 *Applicant:* ${num}\n\n` +
    `📝 *ANSWERS:*\n${app.answers || '(not provided)'}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ Accept: *.crew accept ${app.appUid}*\n` +
    `❌ Deny: *.crew deny ${app.appUid} <reason>*\n\n` +
    `_Reply in any Slammed Society group._`;
};

const pickGood = () => {
  const opts = ['howzit', 'aweh', 'heita'];
  return opts[Math.floor(Math.random() * opts.length)];
};

module.exports = { TEAMS, getQuestions, buildFormMessage, buildHiredMessage, buildDeniedMessage, buildAdminNotice };
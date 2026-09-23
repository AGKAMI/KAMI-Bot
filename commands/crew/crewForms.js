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
  const questions = getQuestions(teamKey).join('\n\n');
  return `━━━━━━━━━━━━━━━━\n` +
    `*${team.label.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `_${teamKey} APPLICATION_\n` +
    `${team.emoji} ${team.role.toUpperCase()} ${team.emoji}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${questions}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `_Good luck with the tryout!_`;
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

// Minimum requirements — shown to admins so they know what to look for
const REQUIREMENTS = [
  '⏱️ *Minimum 2 hours/day* play time (max 10)',
  '🎂 *Minimum age 12*',
  '🎯 *Experience:* not required — just means they need training',
  '🔰 *Loyalty:* must be committed to SS — non-negotiable',
  '📲 *WhatsApp:* must be active daily for comms — non-negotiable',
  '🚨 *Scenario:* judge if their answer shows common sense under pressure',
];

// Build the pending-application notice sent to the team's group admins
// Returns { text, buttons } for use with sendButtons()
const buildAdminNotice = (app) => {
  const team = TEAMS[app.team];
  const num = app.jid ? app.jid.split(':')[0].split('@')[0] : 'unknown';
  const prefix = config.prefix || '.';

  // Use actual questions from session if available, otherwise fallback
  const questions = app.questions || null;
  const answers = app.answers || '(not provided)';

  let qaSection;
  if (questions) {
    // Inline Q&A — already formatted by submitApplication
    qaSection = answers;
  } else {
    // Fallback: hardcoded questions + numbered answers
    const teamQuestions = getQuestionsForAdmin(app.team);
    qaSection = teamQuestions + '\n\n💬 *ANSWERS:*\n' + answers;
  }

  const text = `━━━━━━━━━━━━━━━━\n` +
    `*NEW ${app.team} APPLICATION* ${team ? team.emoji : ''}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🆔 *App ID:* ${app.appUid}\n` +
    `👤 *Applicant:* ${num}\n\n` +
    qaSection + '\n\n' +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📋 *MINIMUM REQUIREMENTS:*\n` +
    REQUIREMENTS.map(r => `• ${r}`).join('\n') + '\n\n' +
    `━━━━━━━━━━━━━━━━\n\n` +
    `_Tap a button below or type manually:_\n` +
    `✅ \`${prefix}crew accept ${app.appUid}\`\n` +
    `❌ \`${prefix}crew deny ${app.appUid} <reason>\`\n` +
    `📋 \`${prefix}crew applicants ${app.team}\``;

  const buttons = [
    { id: `crew:accept:${app.appUid}`, text: `✅ Accept ${num}` },
    { id: `crew:deny:${app.appUid}`, text: `❌ Deny ${num}` },
    { id: `crew:pending:${app.team}`, text: `📋 View Pending` },
  ];

  return { text, buttons };
};

// Format questions with numbered list for admin review
const getQuestionsForAdmin = (teamKey) => {
  const q = [
    ['1️⃣', '⏱️', 'ACTIVITY', 'How many hours per day do you play CPM?'],
    ['2️⃣', '🎂', 'AGE', 'How old are you?'],
    ['3️⃣', '🎯', 'EXPERIENCE', 'Relevant experience in CPM?'],
    ['4️⃣', '🔰', 'LOYALTY', 'Will they follow orders and prioritize SS?'],
    ['5️⃣', '📲', 'COMMUNICATION', 'Are they active on WhatsApp daily?'],
    ['6️⃣', '🚨', 'SCENARIO', 'Do they show common sense under pressure?'],
  ];
  return q.map(([n, em, name, hint]) => `${n} ${em} *${name}* — ${hint}`).join('\n');
};

const pickGood = () => {
  const opts = ['howzit', 'aweh', 'heita'];
  return opts[Math.floor(Math.random() * opts.length)];
};

module.exports = { TEAMS, getQuestions, buildFormMessage, buildHiredMessage, buildDeniedMessage, buildAdminNotice };
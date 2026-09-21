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
  const prefix = config.prefix || '.';
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
    `Go to any Slammed Society group and send:\n\n` +
    `\`${prefix}crew applied ${teamKey} <your answers>\`\n\n` +
    `Put each answer on its own line. Example:\n\n` +
    `\`${prefix}crew applied ${teamKey}\`\n` +
    `\`1) 3 hours\`\n` +
    `\`2) 18\`\n` +
    `\`3) yes did vip before\`\n` +
    `\`4) yes\`\n` +
    `\`5) active on whatsapp\`\n` +
    `\`6) i move the vip to safe zone\`\n\n` +
    (crewTeam ? `You'll get an application ID to track it. ` : ``) +
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
const buildAdminNotice = (app) => {
  const team = TEAMS[app.team];
  const num = app.jid ? app.jid.split('@')[0] : 'unknown';
  const teamQuestions = getQuestionsForAdmin(app.team);
  return `━━━━━━━━━━━━━━━━\n` +
    `*NEW ${app.team} APPLICATION* ${team ? team.emoji : ''}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🆔 *App ID:* ${app.appUid}\n` +
    `👤 *Applicant:* ${num}\n\n` +
    `📝 *QUESTIONS + ANSWERS:*\n${teamQuestions}\n\n` +
    `💬 *APPLICANT'S ANSWERS:*\n${app.answers || '(not provided)'}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📋 *MINIMUM REQUIREMENTS:*\n` +
    REQUIREMENTS.map(r => `• ${r}`).join('\n') + '\n\n' +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ Accept: \`${prefix}crew accept ${app.appUid}\`\n` +
    `❌ Deny: \`${prefix}crew deny ${app.appUid} <reason>\`\n` +
    `📋 View pending: \`${prefix}crew applicants ${app.team}\`\n\n` +
    `_Reply from any Slammed Society group or directly from DM._`;
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

// Format raw applicant answers into a clean numbered list
// Handles: 1. / 1) / 1: / 1️⃣ / 1️⃣. / 1️⃣: / - / • / inline numbering
const formatAnswers = (raw) => {
  if (!raw || typeof raw !== 'string') return raw;

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const answers = [];
  let current = '';

  // Regex: optional whitespace, then a numbering prefix, then separator, then answer text
  // Matches: 1. answer / 1) answer / 1: answer / 1️⃣ answer / 1️⃣. answer / 1️⃣: answer / - answer / • answer
  const prefixRe = /^(?:\d{1,2}[.):]|[1-6][\uFE0F\u20E3]|[-•])\s*/;

  for (const line of lines) {
    const cleaned = line.replace(prefixRe, '').trim();
    if (cleaned && prefixRe.test(line)) {
      // This line starts with a numbering prefix — it's a new answer
      if (current) answers.push(current);
      current = cleaned;
    } else if (current) {
      // No prefix — continuation of previous answer
      current += ' ' + cleaned;
    } else {
      // No prefix and no current answer — check for inline numbering
      // e.g. "3 hours 18 yes did vip before yes active i move the vip to safe zone"
      // Only split inline if we detect the pattern "answer answer" without newlines
      // For now, treat as a single answer block
      current = cleaned;
    }
  }
  if (current) answers.push(current);

  // If no prefixes were detected at all (all lines ended up in one answer),
  // try splitting by inline numbering like "1. answer 2. answer"
  if (answers.length <= 1 && lines.length === 1) {
    const inlineSplit = lines[0]
      .replace(/\d{1,2}[.):]\s*/g, '\n')
      .replace(/[1-6][\uFE0F\u20E3]\s*/g, '\n')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    if (inlineSplit.length > 1) {
      return inlineSplit.map((a, i) => `${i + 1}. ${a}`).join('\n\n');
    }
  }

  return answers.map((a, i) => `${i + 1}. ${a}`).join('\n\n');
};

module.exports = { TEAMS, getQuestions, buildFormMessage, buildHiredMessage, buildDeniedMessage, buildAdminNotice, formatAnswers };
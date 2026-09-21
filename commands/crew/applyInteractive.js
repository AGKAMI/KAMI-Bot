/**
 * Interactive Crew Application Wizard — button-based multi-step form.
 * Replaces text-based application with step-by-step multiple choice.
 *
 * Flow:
 *   applicant taps "Use Buttons" → Q1 → Q2 → ... → Q6 → Review → Confirm → auto-sent to admins
 */

const database = require('../../database');
const config = require('../../config');
const { TEAMS, buildAdminNotice, formatAnswers } = require('./crewForms');
const { buildComparableIds } = require('../../utils/jidHelper');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { pick, SLANG } = require('../../utils/format');

// ── In-memory session store ──────────────────────────────────
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

function getSession(jid) {
  const s = sessions.get(jid);
  if (!s) return null;
  if (Date.now() - s.startedAt > SESSION_TTL) {
    sessions.delete(jid);
    return null;
  }
  return s;
}

function createSession(jid, teamKey, appUid, applicantJid, applyingForSomeone, originFrom) {
  const session = {
    jid,
    teamKey,
    appUid,
    applicantJid,
    applyingForSomeone,
    originFrom,
    answers: {},
    currentQ: 1,
    totalQ: 6,
    stage: 'question', // 'question' | 'review' | 'done'
    startedAt: Date.now(),
  };
  sessions.set(jid, session);
  return session;
}

// ── Question definitions with multiple-choice buttons ────────
function getQuestions(teamKey) {
  return [
    {
      num: 1,
      emoji: '⏱️',
      label: 'ACTIVITY',
      text: 'How many hours per day do you play CPM?',
      options: [
        { id: '1 hr or less',   label: '1 hr or less' },
        { id: '2-3 hours',      label: '2-3 hours' },
        { id: '4-5 hours',      label: '4-5 hours' },
        { id: '6+ hours',       label: '6+ hours' },
      ],
    },
    {
      num: 2,
      emoji: '🎂',
      label: 'AGE',
      text: 'How old are you?',
      options: [
        { id: '12-14',  label: '12-14' },
        { id: '15-17',  label: '15-17' },
        { id: '18-21',  label: '18-21' },
        { id: '22+',    label: '22+' },
      ],
    },
    {
      num: 3,
      emoji: '🎯',
      label: 'EXPERIENCE',
      text: getExperienceQuestion(teamKey),
      options: [
        { id: 'Yes — experienced',  label: 'Yes — experienced' },
        { id: 'A little',          label: 'A little' },
        { id: 'No — but willing to learn', label: 'No — willing to learn' },
      ],
    },
    {
      num: 4,
      emoji: '🔰',
      label: 'LOYALTY',
      text: getLoyaltyQuestion(teamKey),
      options: [
        { id: 'Yes — SS first always',     label: 'Yes — SS first' },
        { id: 'Yes — fully committed',     label: 'Yes — committed' },
        { id: 'I need to think about it',  label: 'Need to think' },
      ],
    },
    {
      num: 5,
      emoji: '📲',
      label: 'COMMUNICATION',
      text: getCommunicationQuestion(teamKey),
      options: [
        { id: 'Yes — very active',    label: 'Yes — very active' },
        { id: 'Sometimes',            label: 'Sometimes' },
        { id: 'Rarely / No',          label: 'Rarely / No' },
      ],
    },
    {
      num: 6,
      emoji: '🚨',
      label: 'SCENARIO',
      text: getScenarioQuestion(teamKey),
      options: getScenarioOptions(teamKey),
    },
  ];
}

// ── Team-adaptive question text ──────────────────────────────
function getExperienceQuestion(teamKey) {
  const map = {
    KSSPS: 'Have you done private security or close protection in CPM before?',
    KSSMS: 'Have you managed security teams or coordinated operations in CPM?',
    KSSMP: 'Have you done law enforcement or patrol work in CPM?',
  };
  return map[teamKey] || 'Have you done security/VIP work in CPM before?';
}

function getLoyaltyQuestion(teamKey) {
  const map = {
    KSSPS: 'Will you follow direct orders from |SS| KAMI without hesitation?',
    KSSMS: 'Will you put SS interests above all else?',
  };
  return map[teamKey] || 'Will you prioritize SS events over other crews?';
}

function getCommunicationQuestion(teamKey) {
  return teamKey === 'KSSMP'
    ? 'Can you respond quickly to security alerts on WhatsApp?'
    : 'Are you active on WhatsApp daily?';
}

function getScenarioQuestion(teamKey) {
  const map = {
    KSSPS: 'A player is following |SS| KAMI aggressively during a meet. What do you do?',
    KSSMS: 'Two security team members are conflicting during an operation. How do you handle it?',
    KSSMP: 'A player is speeding through a restricted zone during an event. What do you do?',
  };
  return map[teamKey] || 'A VIP car gets rammed during an event. What do you do?';
}

function getScenarioOptions(teamKey) {
  // First option is always the correct answer
  const scenarios = {
    KSSPS: [
      { id: 'Correct: Stay calm, call backup, escort KAMI to safety',     label: '🛡️ Stay calm + call backup', correct: true },
      { id: 'Rush the player alone without backup',                       label: '😡 Rush them alone', correct: false },
      { id: 'Ignore it — it\'s not my problem',                           label: '🤷 Ignore it', correct: false },
      { id: 'Yell at the player over voice chat',                         label: '📢 Yell at them', correct: false },
    ],
    KSSMS: [
      { id: 'Correct: Mediate calmly, remind both of the mission goal',   label: '🤝 Mediate + refocus', correct: true },
      { id: 'Take sides with the senior member',                          label: '⚖️ Side with senior', correct: false },
      { id: 'Punish both immediately',                                    label: '🔨 Punish both', correct: false },
      { id: 'Do nothing — let them sort it out',                          label: '🤷 Do nothing', correct: false },
    ],
    KSSMP: [
      { id: 'Correct: Signal them to stop, call for backup if needed',    label: '🚨 Signal + call backup', correct: true },
      { id: 'Chase them at high speed',                                   label: '🏎️ Chase them', correct: false },
      { id: 'Ignore it — focus on the event perimeter',                   label: '🤷 Ignore it', correct: false },
      { id: 'Block the road with my own car',                             label: '🚗 Block the road', correct: false },
    ],
  };
  return scenarios[teamKey] || [
    { id: 'Correct: Protect the VIP, call for backup, document the incident', label: '🛡️ Protect + backup', correct: true },
    { id: 'Chase the rammer',                                                 label: '🏎️ Chase them', correct: false },
    { id: 'Ignore it',                                                        label: '🤷 Ignore', correct: false },
    { id: 'Blame the VIP driver',                                             label: '❌ Blame the VIP', correct: false },
  ];
}

// ── Send the current question to the applicant ───────────────
async function sendCurrentQuestion(sock, session) {
  const questions = getQuestions(session.teamKey);
  const q = questions[session.currentQ - 1];
  const progress = `[${session.currentQ}/${session.totalQ}]`;

  // Build text — show previous answers if any
  let text = `📝 *APPLICATION WIZARD* ${progress}\n\n`;
  text += `${q.emoji} *Q${q.num}: ${q.label}*\n`;
  text += `_${q.text}_\n\n`;

  // Show previous answers
  const keys = Object.keys(session.answers).sort((a, b) => a - b);
  if (keys.length > 0) {
    text += `📋 *Your answers so far:*\n`;
    for (const k of keys) {
      const qi = questions[k - 1];
      text += `${qi.emoji} ${qi.label}: *${session.answers[k]}*\n`;
    }
    text += `\n`;
  }

  text += `Pick an answer below 👇`;

  const buttons = q.options.map(o => ({
    id: `cwiz:a:${session.teamKey}:${session.appUid}:${q.num}:${o.id}`,
    text: o.label,
  }));

  await sendButtons(sock, session.jid, {
    text,
    footer: `${TEAMS[session.teamKey]?.label || session.teamKey} Application`,
    buttons,
  });
}

// ── Send the review screen ───────────────────────────────────
async function sendReview(sock, session) {
  const questions = getQuestions(session.teamKey);
  const team = TEAMS[session.teamKey];

  let text = `━━━━━━━━━━━━━━━━\n`;
  text += `✅ *REVIEW YOUR APPLICATION*\n`;
  text += `━━━━━━━━━━━━━━━━\n\n`;
  text += `🏢 Team: *${session.teamKey}* — ${team?.label || session.teamKey}\n`;
  text += `🆔 App ID: *${session.appUid}*\n\n`;
  text += `📝 *YOUR ANSWERS:*\n\n`;

  for (let i = 1; i <= session.totalQ; i++) {
    const q = questions[i - 1];
    const answer = session.answers[i] || '(skipped)';
    text += `${q.emoji} *Q${q.num} ${q.label}:*\n`;
    text += `   ${answer}\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━\n\n`;
  text += `Tap a button below:`;

  // 3 buttons max: Pick a question to change | Confirm | Redo
  const buttons = [
    { id: `cwiz:pick:${session.teamKey}:${session.appUid}`, text: '✏️ Change Answer' },
    { id: `cwiz:confirm:${session.teamKey}:${session.appUid}`, text: '✅ Confirm & Send' },
    { id: `cwiz:redo:${session.teamKey}:${session.appUid}`, text: '🔄 Redo All' },
  ];

  await sendButtons(sock, session.jid, {
    text,
    footer: `${team?.label || session.teamKey} Application`,
    buttons,
  });
}

// ── Show question picker (for changing an answer) ────────────
async function sendQuestionPicker(sock, session) {
  const questions = getQuestions(session.teamKey);

  let text = `✏️ *Which question do you want to change?*\n\n`;
  for (let i = 1; i <= session.totalQ; i++) {
    const q = questions[i - 1];
    text += `${q.emoji} Q${q.num} ${q.label}: *${session.answers[i] || '(skipped)'}*\n`;
  }

  const buttons = [];
  for (let i = 1; i <= session.totalQ; i++) {
    const q = questions[i - 1];
    buttons.push({
      id: `cwiz:edit:${session.teamKey}:${session.appUid}:${i}`,
      text: `${q.emoji} Q${i}`,
    });
  }

  await sendButtons(sock, session.jid, {
    text,
    footer: 'Pick a question',
    buttons: buttons.slice(0, 3), // Baileys limit
  });

  // If more than 3 questions, send a second row
  if (session.totalQ > 3) {
    await sendButtons(sock, session.jid, {
      text: `More questions:`,
      footer: 'Pick a question',
      buttons: buttons.slice(3, 6),
    });
  }
}

// ── Submit to database + notify admins ───────────────────────
async function submitApplication(sock, session) {
  const questions = getQuestions(session.teamKey);
  const team = TEAMS[session.teamKey];

  // Format answers as numbered list
  const answerLines = [];
  for (let i = 1; i <= session.totalQ; i++) {
    const q = questions[i - 1];
    answerLines.push(`${i}. ${session.answers[i] || '(no answer)'}`);
  }
  const answers = answerLines.join('\n');

  // Update DB — attach answers to existing app
  const crewTeam = config.crewTeams[session.teamKey];
  const resolved = database.resolveTeamWithConfig(session.teamKey);
  const teamGroupJid = (resolved && resolved.jid) || (crewTeam ? crewTeam.jid : null);
  const storeGroupJid = teamGroupJid || session.originFrom;

  const teamData = database.getTeam(storeGroupJid);
  let app = null;
  if (teamData && teamData.applicants && teamData.applicants[session.appUid]) {
    teamData.applicants[session.appUid].answers = answers;
    database.updateTeam(storeGroupJid, teamData);
    app = teamData.applicants[session.appUid];
  }

  // Notify admins
  let adminMsg = null;
  if (teamGroupJid && app) {
    try {
      const { text: noticeText, buttons: noticeButtons } = buildAdminNotice({
        ...app,
        team: session.teamKey,
        answers,
        jid: session.applicantJid,
        appUid: session.appUid,
      });

      const members = await sock.groupMetadata(teamGroupJid).catch(() => null);
      const admins = (members && members.participants
        ? members.participants.filter(p => p.admin).map(p => p.id)
        : []);

      if (admins.length > 0) {
        let dmed = 0;
        for (const adminJid of admins) {
          try {
            await sendButtons(sock, adminJid, {
              text: noticeText,
              footer: `${session.teamKey} Applications`,
              buttons: noticeButtons,
            });
            dmed++;
          } catch (e) {
            console.error(`[CREW WIZARD] admin DM failed ${adminJid}:`, e.message);
          }
        }
        adminMsg = dmed > 0;
      } else {
        await sendButtons(sock, teamGroupJid, {
          text: noticeText,
          footer: `${session.teamKey} Applications`,
          buttons: noticeButtons,
        });
        adminMsg = true;
      }
    } catch (e) {
      console.error('[CREW WIZARD] admin notify failed:', e.message);
      adminMsg = false;
    }
  }

  // Confirm to applicant
  const confirm =
    `━━━━━━━━━━━━━━━━\n` +
    `✅ *APPLICATION SUBMITTED*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏢 Team: *${session.teamKey}* — ${team?.label || session.teamKey}\n` +
    `🆔 App ID: *${session.appUid}*\n\n` +
    (adminMsg === false
      ? `⚠️ _Couldn't notify the team admins automatically — but your application is stored._\n\n`
      : `📲 _Your application has been sent to all ${session.teamKey} admins ${pick(SLANG.good)}_\n\n`) +
    `⏳ Keep this App ID — an admin will accept or reject you.\n\n` +
    `_${pick(SLANG.greeting)}, good luck!_`;

  await sock.sendMessage(session.jid, { text: confirm });

  // Cleanup
  sessions.delete(session.jid);
}

// ── Main entry point — called from apply.js ──────────────────
async function startWizard(sock, jid, teamKey, appUid, applicantJid, applyingForSomeone, originFrom) {
  createSession(jid, teamKey, appUid, applicantJid, applyingForSomeone, originFrom);
  await sendCurrentQuestion(sock, getSession(jid));
}

// ── Button Handlers ──────────────────────────────────────────

// Answer buttons: cwiz:a:<team>:<uid>:<qNum>:<answer>
onButton('cwiz:a:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:a:', '').split(':');
  const teamKey = parts[0];
  const appUid = parts[1];
  const qNum = parseInt(parts[2]);
  const answer = parts.slice(3).join(':');

  const session = getSession(from);
  if (!session || session.stage !== 'question') return;
  if (session.teamKey !== teamKey || session.appUid !== appUid) return;
  if (qNum !== session.currentQ) return;

  // Store answer
  session.answers[qNum] = answer;

  // Move to next question or review
  if (session.currentQ < session.totalQ) {
    session.currentQ++;
    await sendCurrentQuestion(sock, session);
  } else {
    session.stage = 'review';
    await sendReview(sock, session);
  }
});

// Review buttons: cwiz:pick / cwiz:confirm / cwiz:redo
onButton('cwiz:pick:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:pick:', '').split(':');
  const teamKey = parts[0];
  const appUid = parts[1];

  const session = getSession(from);
  if (!session || session.stage !== 'review') return;
  if (session.teamKey !== teamKey || session.appUid !== appUid) return;

  await sendQuestionPicker(sock, session);
});

onButton('cwiz:confirm:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:confirm:', '').split(':');
  const teamKey = parts[0];
  const appUid = parts[1];

  const session = getSession(from);
  if (!session || session.stage !== 'review') return;
  if (session.teamKey !== teamKey || session.appUid !== appUid) return;

  session.stage = 'done';
  await submitApplication(sock, session);
});

onButton('cwiz:redo:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:redo:', '').split(':');
  const teamKey = parts[0];
  const appUid = parts[1];

  const session = getSession(from);
  if (!session) return;
  if (session.teamKey !== teamKey || session.appUid !== appUid) return;

  // Reset
  session.answers = {};
  session.currentQ = 1;
  session.stage = 'question';
  session.startedAt = Date.now();

  await sock.sendMessage(from, {
    text: `🔄 *Answers cleared!*\n\nStarting over from Q1...`,
  });
  await sendCurrentQuestion(sock, session);
});

// Edit buttons: cwiz:edit:<team>:<uid>:<qNum>
onButton('cwiz:edit:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:edit:', '').split(':');
  const teamKey = parts[0];
  const appUid = parts[1];
  const qNum = parseInt(parts[2]);

  const session = getSession(from);
  if (!session || session.stage !== 'review') return;
  if (session.teamKey !== teamKey || session.appUid !== appUid) return;
  if (qNum < 1 || qNum > session.totalQ) return;

  // Remove old answer and jump to that question
  delete session.answers[qNum];
  session.currentQ = qNum;
  session.stage = 'question';

  await sendCurrentQuestion(sock, session);
});

// ── Periodic cleanup (runs every 5 min) ─────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [jid, session] of sessions) {
    if (now - session.startedAt > SESSION_TTL) {
      sessions.delete(jid);
    }
  }
}, 5 * 60 * 1000);

module.exports = { startWizard, getQuestions };

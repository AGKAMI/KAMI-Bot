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
const { pick, SLANG, mention } = require('../../utils/format');
const { SSRS, KSSPS, KSSMP, KSSMS, shuffle } = require('./questionPools');

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
  const { questions, indices } = getRandomQuestions(teamKey);
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
    questions,
    questionIndices: indices,
  };
  sessions.set(jid, session);
  return session;
}

// ── Question definitions with multiple-choice buttons ────────
const TEAM_POOLS = { SSRS, KSSPS, KSSMP, KSSMS };
const CATEGORIES = ['activity', 'age', 'experience', 'loyalty', 'communication', 'scenario'];

function getRandomQuestions(teamKey) {
  const pool = TEAM_POOLS[teamKey] || SSRS;
  const questions = [];
  const indices = [];

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const variants = pool[cat];
    const idx = Math.floor(Math.random() * variants.length);
    const chosen = variants[idx];
    questions.push({
      num: i + 1,
      emoji: ['⏱️', '🎂', '🎯', '🔰', '📲', '🚨'][i],
      label: cat.toUpperCase(),
      text: chosen.text,
      options: shuffle(chosen.options),
    });
    indices.push(idx);
  }

  return { questions, indices };
}

function getQuestions(teamKey) {
  return getRandomQuestions(teamKey).questions;
}

// ── Send the current question to the applicant ───────────────
async function sendCurrentQuestion(sock, session) {
  const questions = session.questions;
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

  // Split options into rows of 3 (Baileys limit)
  const buttons = q.options.slice(0, 3).map(o => ({
    id: `cwiz:a:${session.teamKey}:${session.appUid}:${q.num}:${o.id}`,
    text: o.label,
  }));

  await sendButtons(sock, session.jid, {
    text,
    footer: `${TEAMS[session.teamKey]?.label || session.teamKey} Application`,
    buttons,
  });

  // If more than 3 options, send additional rows
  if (q.options.length > 3) {
    await sendButtons(sock, session.jid, {
      text: `More options:`,
      footer: `${TEAMS[session.teamKey]?.label || session.teamKey} Application`,
      buttons: q.options.slice(3, 6).map(o => ({
        id: `cwiz:a:${session.teamKey}:${session.appUid}:${q.num}:${o.id}`,
        text: o.label,
      })),
    });
  }
  if (q.options.length > 6) {
    await sendButtons(sock, session.jid, {
      text: `Last option:`,
      footer: `${TEAMS[session.teamKey]?.label || session.teamKey} Application`,
      buttons: q.options.slice(6, 9).map(o => ({
        id: `cwiz:a:${session.teamKey}:${session.appUid}:${q.num}:${o.id}`,
        text: o.label,
      })),
    });
  }
}

// ── Send the review screen ───────────────────────────────────
async function sendReview(sock, session) {
  const questions = session.questions;
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
    { id: `cwiz:submit:${session.teamKey}:${session.appUid}`, text: '✅ Confirm & Send' },
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
  const questions = session.questions;

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
  const questions = session.questions;
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

onButton('cwiz:submit:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:submit:', '').split(':');
  const teamKey = parts[0];
  const appUid = parts[1];

  const session = getSession(from);
  if (!session || session.stage !== 'review') return;
  if (session.teamKey !== teamKey || session.appUid !== appUid) return;

  // Show review choice: admin review or bot review
  await sendButtons(sock, from, {
    text:
      `━━━━━━━━━━━━━━━━\n` +
      `*HOW SHOULD WE REVIEW?*\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Choose how your application gets reviewed:`,
    footer: `${teamKey} Application`,
    buttons: [
      { id: `cwiz:adminreview:${teamKey}:${appUid}`, text: '📋 Send to Admins' },
      { id: `cwiz:botreview:${teamKey}:${appUid}`, text: '🤖 Bot Review' },
    ],
  });
});

// Admin review — current behavior
onButton('cwiz:adminreview:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:adminreview:', '').split(':');
  const teamKey = parts[0];
  const appUid = parts[1];

  const session = getSession(from);
  if (!session) return;
  if (session.teamKey !== teamKey || session.appUid !== appUid) return;

  session.stage = 'done';
  await submitApplication(sock, session);
});

// Bot review — auto-evaluate answers with scoring
onButton('cwiz:botreview:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.replace('cwiz:botreview:', '').split(':');
  const teamKey = parts[0];
  const appUid = parts[1];

  const session = getSession(from);
  if (!session) return;
  if (session.teamKey !== teamKey || session.appUid !== appUid) return;

  const questions = session.questions;
  const team = TEAMS[teamKey];

  // ── Scoring ──
  let totalScore = 0;
  let maxScore = 0;
  let skippedCount = 0;
  const issues = [];

  for (let i = 1; i <= session.totalQ; i++) {
    const q = questions[i - 1];
    const answer = (session.answers[i] || '').trim();
    const isScenario = q.label === 'SCENARIO';

    // Find the selected option's score
    const selectedOption = q.options.find(o => o.id === answer);
    const score = selectedOption ? (selectedOption.score || 0) : 0;
    const maxPossible = isScenario ? 14 : 7; // scenario = 2x weight

    maxScore += maxPossible;

    if (!answer || answer === '(skipped)') {
      skippedCount++;
      issues.push(`Q${i} (${q.label}) was skipped`);
      continue;
    }

    if (isScenario) {
      // Scenario: correct = 14 pts, wrong = score * 2
      const isCorrect = selectedOption && selectedOption.correct;
      totalScore += isCorrect ? 14 : (score * 2);
      if (!isCorrect) issues.push(`Q${i} (${q.label}) — wrong scenario answer`);
    } else {
      // Other: score as-is (0-7)
      totalScore += score;
      if (score <= 2) issues.push(`Q${i} (${q.label}) — weak answer`);
    }
  }

  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  // Decision thresholds
  if (skippedCount >= 3) {
    await sock.sendMessage(from, {
      text:
        `━━━━━━━━━━━━━━━━\n` +
        `🤖 *BOT REVIEW*\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `⚠️ You skipped ${skippedCount} questions\n\n` +
        `_Sending to admins for manual review instead._`,
    });
    session.stage = 'done';
    await submitApplication(sock, session);
    return;
  }

  if (percentage < 50) {
    // Reject — needs improvement
    await sendButtons(sock, from, {
      text:
        `━━━━━━━━━━━━━━━━\n` +
        `🤖 *BOT REVIEW*\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `❌ *Application needs improvement*\n\n` +
        `Score: *${totalScore}/${maxScore}* (${percentage}%)\n\n` +
        `Issues:\n` +
        issues.map(i => `• ${i}`).join('\n') +
        `\n\n_Try improving your answers or send to admins for manual review._`,
      footer: `${teamKey} Application`,
      buttons: [
        { id: `cwiz:pick:${teamKey}:${appUid}`, text: '✏️ Improve Answers' },
        { id: `cwiz:adminreview:${teamKey}:${appUid}`, text: '📋 Send to Admins' },
      ],
    });
    return;
  }

  if (percentage < 70) {
    // Borderline — send to admins
    await sock.sendMessage(from, {
      text:
        `━━━━━━━━━━━━━━━━\n` +
        `🤖 *BOT REVIEW*\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `⏳ *Borderline application*\n\n` +
        `Score: *${totalScore}/${maxScore}* (${percentage}%)\n\n` +
        `_Sending to admins for manual review._`,
    });
    session.stage = 'done';
    await submitApplication(sock, session);
    return;
  }

  // ── Passed — auto-approve (70%+) ──
  session.stage = 'done';

  // Format answers
  const answerLines = [];
  for (let i = 1; i <= session.totalQ; i++) {
    const q = questions[i - 1];
    answerLines.push(`${i}. ${session.answers[i] || '(no answer)'}`);
  }
  const answers = answerLines.join('\n');

  // Update DB
  const crewTeam = config.crewTeams[teamKey];
  const resolved = database.resolveTeamWithConfig(teamKey);
  const teamGroupJid = (resolved && resolved.jid) || (crewTeam ? crewTeam.jid : null);
  const storeGroupJid = teamGroupJid || session.originFrom;

  const teamData = database.getTeam(storeGroupJid);
  if (teamData && teamData.applicants && teamData.applicants[appUid]) {
    teamData.applicants[appUid].answers = answers;
    teamData.applicants[appUid].status = 'approved';
    teamData.applicants[appUid].reviewedBy = 'bot';
    teamData.applicants[appUid].reviewedAt = new Date().toISOString();
    database.updateTeam(storeGroupJid, teamData);
  }

  // Notify admins that bot approved
  if (teamGroupJid) {
    try {
      const members = await sock.groupMetadata(teamGroupJid).catch(() => null);
      const admins = (members && members.participants
        ? members.participants.filter(p => p.admin).map(p => p.id)
        : []);

      const botNotice =
        `🤖 *BOT AUTO-APPROVED*\n\n` +
        `👤 ${mention(session.applicantJid)}\n` +
        `🏢 Team: *${teamKey}*\n` +
        `🆔 App ID: *${appUid}*\n\n` +
        `_Answers passed quality checks. Use ${config.prefix || '.'}crew accept ${appUid} to finalize._`;

      const targets = admins.length > 0 ? admins : [teamGroupJid];
      for (const target of targets) {
        try {
          await sock.sendMessage(target, {
            text: botNotice,
            mentions: [session.applicantJid],
          });
        } catch (e) {}
      }
    } catch (e) {}
  }

  // Confirm to applicant
  const confirm =
    `━━━━━━━━━━━━━━━━\n` +
    `✅ *APPLICATION APPROVED*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🤖 _Bot reviewed your answers and you passed!_\n\n` +
    `🏢 Team: *${teamKey}* — ${team?.label || teamKey}\n` +
    `🆔 App ID: *${appUid}*\n\n` +
    `_An admin will add you to the group shortly ${pick(SLANG.good)}_\n\n` +
    `_${pick(SLANG.greeting)}, welcome to the squad!_`;

  await sock.sendMessage(from, { text: confirm });

  // Cleanup
  sessions.delete(from);
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

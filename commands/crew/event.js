/**
 * Event Command — CPM event cards.
 *
 * Bare `!event` → the interactive builder (eventWizard.js): title
 * templates → host → room ID → server → car type → optional time →
 * review → post. The legacy one-liner `!event <name> <HH:MM>` is kept
 * VERBATIM (muscle memory + again: replays) — it only launches when the
 * LAST argument is a valid HH:MM, so `!event Stance Meet` (no time)
 * opens the builder instead of erroring.
 *
 * Same module serves `!crew event` (crew.js auto-loads it by subName).
 * adminOnly + groupOnly enforced by the existing command gates; the
 * wizard's own taps are additionally creator-locked.
 */

const database = require('../../database');
const config = require('../../config');
const eventWizard = require('./eventWizard');
const { TIME_RE } = require('./cpmData');

module.exports = {
  subName: 'event',
  name: 'event',
  category: 'crew',
  description: 'Line up a CPM meet — interactive card builder',
  usage: '.event  ·  .event <name> <HH:MM> (one-liner)  ·  .event cancel',
  adminOnly: true,
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';

    // `!event cancel` — scrap the sender's running draft in this chat
    if ((args[0] || '').toLowerCase() === 'cancel') {
      return eventWizard.cancelWizardFor(sock, msg, extra);
    }

    // Legacy one-liner — only when the last arg is a real HH:MM
    const lastArg = args && args.length ? args[args.length - 1] : '';
    if (args && args.length >= 2 && TIME_RE.test(lastArg)) {
      const time = lastArg;
      const name = args.slice(0, -1).join(' ');

      const eventId = `evt_${Date.now()}`;

      database.addCrewEvent(extra.from, eventId, {
        name,
        time,
        createdBy: msg.key.participant || msg.key.remoteJid,
        attendees: [],
        status: 'upcoming',
        createdAt: new Date().toISOString(),
      });

      return sock.sendMessage(extra.from, {
        text:
          `📅 *EVENT CREATED*\n\n` +
          `🏎️ *${name}*\n` +
          `⏰ *${time}*\n\n` +
          `Everyone RSVPs with: \`${prefix}attend\``,
      }, { quoted: msg });
    }

    // Bare `!event` (or args without a valid time) → the builder
    return eventWizard.startWizard(sock, msg, extra);
  }
};

/**
 * Crew Command Router - Handles all crew subcommands
 * Usage: .crew <subcommand> [args]
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const fs = require('fs');
const path = require('path');

// Load all crew sub-handlers
const subHandlers = {};
const handlersPath = path.join(__dirname);
fs.readdirSync(handlersPath)
  .filter(f => f.endsWith('.js') && f !== 'crew.js')
  .forEach(file => {
    const handler = require(path.join(handlersPath, file));
    if (handler.name) {
      subHandlers[handler.name] = handler;
    }
  });

// Team colors for display
const TEAM_COLORS = {
  'SSRS': '🟢🔵🟡',
  'KSSPS': '⚫🔴⚪',
  'Meet Control': '🔴⚪⚫',
  'KSSMP': '🔵⚪🩵',
  'KSSMS': '⚫⚪🔴'
};

module.exports = {
  name: 'crew',
  aliases: ['ss', 'slammed'],
  category: 'crew',
  description: 'Slammed Society crew management',
  usage: '.crew <add|remove|roster|promote|demote|role|checkin|activity|leaderboard|attendance|event|events|attend|result|apply|accept|deny|applicants|info|name|bio|banner>',

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || '').toLowerCase();
      const subArgs = args.slice(1);

      if (!sub || sub === 'help') {
        return showHelp(sock, msg, extra);
      }

      // Route to sub-handler
      const handler = subHandlers[sub];
      if (handler) {
        return handler.execute(sock, msg, subArgs, extra, { TEAM_COLORS, database, bold, pick, SLANG });
      }

      // Check for aliased commands
      const aliasMap = {
        'rm': 'remove',
        'ls': 'roster',
        'list': 'roster',
        'up': 'promote',
        'down': 'demote',
        'setrole': 'role',
        'in': 'checkin',
        'stats': 'activity',
        'lb': 'leaderboard',
        'top': 'leaderboard',
        'rsvp': 'attend',
        'winner': 'result',
        'join': 'apply',
        'hire': 'accept',
        'fire': 'deny',
        'pending': 'applicants',
        'about': 'info',
        'setname': 'name',
        'setbio': 'bio',
        'setbanner': 'banner'
      };

      const aliased = aliasMap[sub];
      if (aliased && subHandlers[aliased]) {
        return subHandlers[aliased].execute(sock, msg, subArgs, extra, { TEAM_COLORS, database, bold, pick, SLANG });
      }

      return extra.reply(
        `❌ *ERROR*\n\n` +
        `_Unknown crew command: ${sub}_\n\n` +
        `_Use .crew help for available commands_`
      );

    } catch (error) {
      console.error('Crew command error:', error);
      await extra.reply(`❌ *ERROR*\n\n_${error.message}_`);
    }
  }
};

async function showHelp(sock, msg, extra) {
  const text = [
    `🔰 *SLAMMED SOCIETY CREW*`,
    ``,
    `📋 *ROSTER*`,
    `• .crew add @user <role> [team]`,
    `• .crew remove @user`,
    `• .crew roster [team]`,
    `• .crew promote @user <role>`,
    `• .crew demote @user`,
    `• .crew role @user <role>`,
    ``,
    `✅ *ACTIVITY*`,
    `• .crew checkin`,
    `• .crew activity [7d]`,
    `• .crew leaderboard`,
    `• .crew attendance [event-id]`,
    ``,
    `📅 *EVENTS*`,
    `• .crew event <name> <time>`,
    `• .crew events`,
    `• .crew attend [event-id]`,
    `• .crew result <event-id> <winner>`,
    ``,
    `📋 *RECRUITMENT*`,
    `• .crew apply <team>`,
    `• .crew accept @user [team]`,
    `• .crew deny @user [reason]`,
    `• .crew applicants`,
    ``,
    `🔰 *IDENTITY*`,
    `• .crew info`,
    `• .crew name <name>`,
    `• .crew bio <text>`,
    `• .crew banner`,
    ``,
    `_${pick(SLANG.vibe)} — Slammed Society CPM_`
  ].join('\n');

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

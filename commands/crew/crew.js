/**
 * Crew Command Router — Handles all crew subcommands
 * Usage: .crew [team] <subcommand> [args]
 * 
 * Examples:
 *   .crew add @user        — add to current group's team
 *   .crew ssrs add @user   — add to SSRS (from any group)
 *   .crew kssps roster     — show KSSPS roster (from any group)
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const fs = require('fs');
const path = require('path');

// Load all crew sub-handlers
const subHandlers = {};
const handlersPath = path.join(__dirname);
fs.readdirSync(handlersPath)
  .filter(f => f.endsWith('.js') && f !== 'crew.js' && f !== 'crewHelpers.js' && f !== 'setroles.js' && f !== 'viewroles.js')
  .forEach(file => {
    const handler = require(path.join(handlersPath, file));
    const subName = handler.subName || handler.name;
    if (subName) {
      subHandlers[subName] = handler;
    }
  });

// Valid subcommands (to detect if first arg is a team or a command)
const SUBCOMMANDS = Object.keys(subHandlers);

module.exports = {
  name: 'crew',
  aliases: ['ss', 'slammed'],
  category: 'crew',
  description: 'Slammed Society crew management',
  usage: '.crew [team] <add|remove|promote|demote|role|event|events|attend|result|apply|accept|deny|applicants|teams|setteam> [args]',
  groupOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || '').toLowerCase();
      const subArgs = args.slice(1);

      // No args → show help
      if (!sub || sub === 'help') {
        return showHelp(sock, msg, extra);
      }

      // .crew teams — show all team abbreviations
      if (sub === 'teams') {
        return showTeams(sock, msg, extra);
      }

      // Group whitelist check — only work in Slammed Society groups
      const crewJids = Object.values(database.getTeamMap()).map(t => t.jid);
      const inCrewGroup = crewJids.includes(extra.from);

      // .crew setteam — only works in crew groups
      if (sub === 'setteam') {
        if (!inCrewGroup) {
          return extra.reply(
            `❌ ERROR\n\nThis command only works in Slammed Society groups\n\n` +
            `Your group: ${extra.from.split('@')[0]}`
          );
        }
        return setTeam(sock, msg, subArgs, extra);
      }

      // Determine if first arg is a team abbreviation or a subcommand
      let targetJid = extra.from; // default: current group
      let actualSub = sub;
      let actualArgs = subArgs;

      // If first arg is NOT a subcommand, treat it as a team abbreviation
      if (!SUBCOMMANDS.includes(sub)) {
        const resolved = database.resolveTeam(sub);
        if (resolved) {
          targetJid = resolved.jid;
          actualSub = (subArgs[0] || '').toLowerCase();
          actualArgs = subArgs.slice(1);
        } else {
          return extra.reply(
            `❌ ERROR\n\nUnknown team or command: ${sub}\n\n` +
            `Use .crew teams to see available abbreviations\n` +
            `Use .crew help for commands`
          );
        }
      } else {
        // Subcommand without team abbreviation
        const isDM = !extra.from.endsWith('@g.us');
        const isTeamAdmin = database.isTeamAdmin(extra.sender);
        const isOwner = !!extra.isOwner;

        if (isDM) {
          // DM context — enforce team-admin access rules
          if (sub === 'accept' || sub === 'deny') {
            // accept/deny from DM: owner or team admin only
            if (!isOwner && !isTeamAdmin) {
              return extra.reply(
                `❌ ERROR\n\nOnly SS team admins or the owner can accept/deny applications from DMs`
              );
            }
            // allowed — route to handler below
          } else if (sub !== 'apply' && sub !== 'applied') {
            // Any other crew command in DM
            if (!isOwner) {
              if (isTeamAdmin) {
                return extra.reply(
                  `❌ ERROR\n\nAs a team admin you're only allowed to accept or deny pending applications from DMs`
                );
              }
              return extra.reply(
                `❌ ERROR\n\nFrom DMs, you must specify a team\n\n` +
                `Usage: .crew <team> ${sub} [args]\n` +
                `Example: .crew ssrs ${sub}\n\n` +
                `Use .crew teams to see abbreviations`
              );
            }
            // owner in DM can run anything — continue
          }
        } else {
          // Group context
          if (sub !== 'apply' && sub !== 'applied') {
            if (!inCrewGroup) {
              return extra.reply(
                `❌ ERROR\n\nThis command only works in Slammed Society groups\n\n` +
                `Your group: ${extra.from.split('@')[0]}`
              );
            }
          }
        }
      }

      // No subcommand after team
      if (!actualSub) {
        return extra.reply(
          `❌ ERROR\n\nSpecify a command after the team abbreviation\n\n` +
          `Example: .crew ${sub} roster`
        );
      }

      // Route to sub-handler
      const handler = subHandlers[actualSub];
      if (handler) {
        // Inject resolved group JID into extra
        const patchedExtra = { ...extra, from: targetJid };
        return handler.execute(sock, msg, actualArgs, patchedExtra);
      }

      // Check for aliased commands
      const aliasMap = {
        'rm': 'remove',
        'setrole': 'role',
        'rsvp': 'attend',
        'winner': 'result',
        'join': 'apply',
        'hire': 'accept',
        'fire': 'deny',
        'pending': 'applicants'
      };

      const aliased = aliasMap[actualSub];
      if (aliased && subHandlers[aliased]) {
        const patchedExtra = { ...extra, from: targetJid };
        return subHandlers[aliased].execute(sock, msg, actualArgs, patchedExtra);
      }

      return extra.reply(
        `❌ ERROR\n\nUnknown command: ${actualSub}\n\n` +
        `Use .crew help for available commands`
      );

    } catch (error) {
      console.error('Crew command error:', error);
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};

async function setTeam(sock, msg, args, extra) {
  const abbrev = (args[0] || '').toUpperCase();
  const teamName = args.slice(1).join(' ') || abbrev;

  if (!abbrev) {
    return extra.reply(
      `❌ ERROR\n\nUsage: .crew setteam <abbrev> [team name]\n\n` +
      `Example: .crew setteam SSRS Royal Security\n\n` +
      `Run this IN the group you want to map.`
    );
  }

  database.setTeamMap(abbrev, extra.from, teamName);

  await sock.sendMessage(extra.from, {
    text: `✅ SUCCESS\n\n🏷️ TEAM MAPPED\n\n` +
          `Abbreviation: ${bold(abbrev)}\n` +
          `Team: ${bold(teamName)}\n` +
          `Group: ${extra.from.split('@')[0]}\n\n` +
          `Now you can use: .crew ${abbrev.toLowerCase()} <command>`
  }, { quoted: msg });
}

async function showTeams(sock, msg, extra) {
  const teamMap = database.getTeamMap();
  const teams = Object.entries(teamMap);

  let text = `🏷️ *TEAM ABBREVIATIONS*\n`;
  text += `----------\n`;

  if (teams.length === 0) {
    text += `\n_No teams configured yet_\n`;
    text += `\nRun .crew setteam <abbrev> in each group to map them`;
  } else {
    for (const [abbrev, data] of teams) {
      text += `\n• ${bold(abbrev)} — ${data.name}`;
      text += `\n  📍 ${data.jid.split('@')[0]}`;
    }
    text += `\n----------\n`;
    text += `\nUsage: .crew <abbrev> <command>`;
  }

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

async function showHelp(sock, msg, extra) {
  const text = [
    `🔰 *SLAMMED SOCIETY CREW*`,
    ``,
    `📋 *ROSTER*`,
    `• .crew add @user [role]`,
    `• .crew remove @user`,
    `• .crew promote @user <role>`,
    `• .crew demote @user`,
    `• .crew role @user <role>`,
    ``,
    `📅 *EVENTS*`,
    `• .crew event <name> <time>`,
    `• .crew events`,
    `• .crew attend [event-id]`,
    `• .crew result <event-id> <winner>`,
    ``,
    `📋 *RECRUITMENT*`,
    `• .crew apply <team> — get the application form in DMs`,
    `• .crew applied <team> <answers> — submit your application`,
    `• .crew applicants — view pending apps (with IDs)`,
    `• .crew accept <appUid> — accept an applicant`,
    `• .crew deny <appUid> <reason> — reject an applicant`,
    ``,
    `🏷️ *TEAMS*`,
    `• .crew teams — list all abbreviations`,
    `• .crew setteam <abbrev> — map group to abbreviation`,
    `• .crew <abbrev> <command> — run command on specific team`,
    ``,
    `💡 _Example: .crew ssrs add @user_`,
    ``,
    `_${pick(SLANG.vibe)} — Slammed Society CPM_`
  ].join('\n');

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

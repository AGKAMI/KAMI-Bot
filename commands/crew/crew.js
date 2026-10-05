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
const { bold, pick, SLANG, voice } = require('../../utils/format');
const fs = require('fs');
const path = require('path');

const config = require('../../config');
const prefix = config.prefix || '.';
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

// Subcommands that read a team token from their own first arg — never strip it
const TEAM_TOKEN_SUBS = new Set(['apply', 'applicants', 'history', 'pending']);

module.exports = {
  name: 'crew',
  reactions: { received: '👥', done: '🎖️' },
  aliases: ['ss', 'slammed'],
  category: 'crew',
  description: 'Slammed Society crew management',
  usage: '.crew [team] <add|remove|promote|demote|role|event|events|attend|result|apply|accept|deny|applicants|teams|setteam> [args]',
  groupOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const sub = (args[0] || '').toLowerCase();
      const subArgs = args.slice(1);

      // Shared by both routing branches + the sub-handler dispatch below.
      // These used to sit inside the else block only, so the routing code
      // (adminOnly/groupOnly/aliasMap checks) blew up with
      // "isDM is not defined" / "aliasMap is not defined".
      const isDM = !extra.from.endsWith('@g.us');
      const isTeamAdmin = database.isTeamAdmin(extra.sender);
      const isOwner = !!extra.isOwner;

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
          extra.fail();
          return extra.reply(
            `❌ ERROR\n\nThis only works in Slammed Society groups\n\n` +
            `Your group: ${extra.from.split(':')[0].split('@')[0]}`
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
        const resolved = database.resolveTeamWithConfig(sub);
        if (resolved) {
          targetJid = resolved.jid;
          actualSub = (subArgs[0] || '').toLowerCase();
          actualArgs = subArgs.slice(1);
        } else {
          extra.fail();
          return extra.reply(
            `❌ ERROR\n\nDon't know that team or command: ${sub}\n\n` +
            `Use ${prefix}crew teams for the list of abbreviations\n` +
            `Use ${prefix}crew help for the commands`
          );
        }
      } else {
        // Subcommand without team abbreviation
        if (isDM) {
          // DM context — enforce team-admin access rules
          const isApproved = database.isApprovedNumber(extra.sender);

          // Owner-only commands: block everyone except owner
          const handler = subHandlers[actualSub] || subHandlers[aliasMap[actualSub]];
          if (handler && handler.ownerOnly && !isOwner) {
            extra.fail();
            return extra.reply(
              `❌ ERROR\n\nOwner-only, nobody else`
            );
          }

          if (sub === 'accept' || sub === 'deny') {
            // accept/deny from DM: owner, approved, or team admin only
            if (!isOwner && !isApproved && !isTeamAdmin) {
              extra.fail();
              return extra.reply(
                `❌ ERROR\n\nOnly SS team admins or the owner can accept or deny applications in DMs`
              );
            }
            // allowed — route to handler below
          } else if (sub !== 'apply' && sub !== 'applicants' && sub !== 'pending') {
            // Any other crew command in DM
            if (!isOwner && !isApproved) {
              if (isTeamAdmin) {
                extra.fail();
                return extra.reply(
                  `❌ ERROR\n\nAi — as a team admin you only accept or deny pending applications in DMs`
                );
              }
              extra.fail();
              return extra.reply(
                `❌ ERROR\n\nIn DMs you gotta name a team\n\n` +
                `Usage: ${prefix}crew <team> ${sub} [args]\n` +
                `Example: ${prefix}crew ssrs ${sub}\n\n` +
                `Use ${prefix}crew teams for the abbreviations`
              );
            }
            // owner/approved in DM can run anything — continue
          }
        } else {
          // Group context
          if (sub !== 'apply') {
            if (!inCrewGroup && !isOwner) {
              extra.fail();
              return extra.reply(
                `❌ ERROR\n\nThis only works in Slammed Society groups\n\n` +
            `Your group: ${extra.from.split(':')[0].split('@')[0]}`
          );
        }
      }
        }
      }

      // `.crew remove kssms <target>` — team token AFTER the subcommand.
      // The canonical order `.crew kssms remove <target>` also still works;
      // both end up operating on the team's group via patchedExtra.from.
      if (actualArgs.length > 0 && !TEAM_TOKEN_SUBS.has(actualSub)) {
        const tokenTeam = database.resolveTeamWithConfig(actualArgs[0]);
        if (tokenTeam) {
          targetJid = tokenTeam.jid;
          actualArgs = actualArgs.slice(1);
        }
      }

      // No subcommand after team
      if (!actualSub) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nGive a command after the team abbreviation\n\n` +
          `Example: ${prefix}crew ${sub} roster`
        );
      }

      // Route to sub-handler
      const handler = subHandlers[actualSub];
      if (handler) {
        // Check sub-handler permission flags
        if (handler.adminOnly && !extra.isAdmin && !isOwner) {
          extra.fail();
          return extra.reply(`❌ ERROR\n\nYou need admin for this one, hey`);
        }
        // Groups only — but if a team group was resolved (team-first or team
        // token), the target isn't the DM itself, so it's fine to continue.
        if (handler.groupOnly && isDM && targetJid === extra.from) {
          extra.fail();
          return extra.reply(`❌ ERROR\n\nGroups only, this one`);
        }
        // Inject resolved group JID into extra
        const patchedExtra = { ...extra, from: targetJid };
        return handler.execute(sock, msg, actualArgs, patchedExtra);
      }

      // Check for aliased commands
      const aliased = aliasMap[actualSub];
      if (aliased && subHandlers[aliased]) {
        const aliasedHandler = subHandlers[aliased];
        if (aliasedHandler.adminOnly && !extra.isAdmin && !isOwner) {
          extra.fail();
          return extra.reply(`❌ ERROR\n\nYou need admin for this one, hey`);
        }
        if (aliasedHandler.groupOnly && isDM && targetJid === extra.from) {
          extra.fail();
          return extra.reply(`❌ ERROR\n\nGroups only, this one`);
        }
        const patchedExtra = { ...extra, from: targetJid };
        return aliasedHandler.execute(sock, msg, actualArgs, patchedExtra);
      }

      extra.fail();
      return extra.reply(
        `❌ ERROR\n\nUnknown command: ${actualSub}\n\n` +
        `Use ${prefix}crew help for what's available`
      );

    } catch (error) {
      console.error('Crew command error:', error);
      extra.fail();
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};

async function setTeam(sock, msg, args, extra) {
  const abbrev = (args[0] || '').toUpperCase();
  const teamName = args.slice(1).join(' ') || abbrev;

  if (!abbrev) {
    extra.fail();
    return extra.reply(
      `❌ ERROR\n\nUsage: ${prefix}crew setteam <abbrev> [team name]\n\n` +
      `Eg: ${prefix}crew setteam SSRS Royal Security\n\n` +
      `Run this IN the group you're mapping.`
    );
  }

  database.setTeamMap(abbrev, extra.from, teamName);

  await sock.sendMessage(extra.from, {
    text: `✅ SUCCESS\n\n🏷️ TEAM MAPPED\n\n` +
          `Abbreviation: ${bold(abbrev)}\n` +
          `Team: ${bold(teamName)}\n` +
          `Group: ${extra.from.split(':')[0].split('@')[0]}\n\n` +
          `Now you can run: ${prefix}crew ${abbrev.toLowerCase()} <command>`
  }, { quoted: msg });
}

async function showTeams(sock, msg, extra) {
  const teamMap = database.getTeamMap();
  const teams = Object.entries(teamMap);

  let text = `🏷️ *TEAM ABBREVIATIONS*\n`;
  text += `----------\n`;

  if (teams.length === 0) {
    text += `\n_No teams configured yet_\n`;
    text += `\nRun ${prefix}crew setteam <abbrev> in every group to map them`;
  } else {
    for (const [abbrev, data] of teams) {
      text += `\n• ${bold(abbrev)} — ${data.name}`;
      text += `\n  📍 ${data.jid.split(':')[0].split('@')[0]}`;
    }
    text += `\n----------\n`;
    text += `\nUsage: ${prefix}crew <abbrev> <command>`;
  }

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

async function showHelp(sock, msg, extra) {
  const text = [
    `🔰 *SLAMMED SOCIETY CREW*`,
    ``,
    `📋 *ROSTER*`,
    `• ${prefix}crew add @user [role]`,
    `• ${prefix}crew remove @user`,
    `• ${prefix}crew promote @user <role>`,
    `• ${prefix}crew demote @user`,
    `• ${prefix}crew role @user <role>`,
    ``,
    `📅 *EVENTS*`,
    `• ${prefix}crew event <name> <time>`,
    `• ${prefix}crew events`,
    `• ${prefix}crew attend [event-id]`,
    `• ${prefix}crew result <event-id> <winner>`,
    ``,
    `📋 *RECRUITMENT*`,
    `• ${prefix}crew apply <team> — the form lands in your DMs`,
    `• ${prefix}crew applicants — see pending apps with IDs`,
    `• ${prefix}crew accept <appUid> — take the applicant in`,
    `• ${prefix}crew deny <appUid> <reason> — turn them down`,
    ``,
    `🏷️ *TEAMS*`,
    `• ${prefix}crew teams — every abbreviation`,
    `• ${prefix}crew setteam <abbrev> — map a group to an abbreviation`,
    `• ${prefix}crew <abbrev> <command> — run it for a specific team`,
    ``,
    `💡 _Example: ${prefix}crew ssrs add @user_`,
    ``,
    `_${voice.open()} — Slammed Society CPM_`
  ].join('\n');

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

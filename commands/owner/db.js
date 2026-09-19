/**
 * DB Command Router — Owner database management
 * Usage: .db <subcommand> [args]
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'database');

const TABLES = {
  'groups': { file: 'groups.json', desc: 'Group settings & config' },
  'users': { file: 'users.json', desc: 'User profiles' },
  'warnings': { file: 'warnings.json', desc: 'User warnings' },
  'mods': { file: 'mods.json', desc: 'Moderators list' },
  'crew': { file: 'crew.json', desc: 'Per-group crew rosters, events & applicants' },
  'global': { file: 'global.json', desc: 'Global settings (selfMode, approved)' }
};

module.exports = {
  name: 'db',
  aliases: ['database', 'dbmanager'],
  category: 'owner',
  description: 'Database management (owner only)',
  usage: '.db <view|stats|backup|reset|search|edit|delete> [args]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const sub = (args[0] || '').toLowerCase();
      const subArgs = args.slice(1);

      if (!sub || sub === 'help') {
        return showHelp(sock, msg, extra);
      }

      // View table
      if (sub === 'view' || sub === 'show') {
        return viewTable(sock, msg, subArgs, extra);
      }

      // Database stats
      if (sub === 'stats') {
        return showStats(sock, msg, extra);
      }

      // Backup database
      if (sub === 'backup') {
        return backupDb(sock, msg, extra);
      }

      // Reset table
      if (sub === 'reset') {
        return resetTable(sock, msg, subArgs, extra);
      }

      // Search database
      if (sub === 'search') {
        return searchDb(sock, msg, subArgs, extra);
      }

      // Edit entry
      if (sub === 'edit') {
        return editEntry(sock, msg, subArgs, extra);
      }

      // Delete entry
      if (sub === 'delete' || sub === 'del' || sub === 'rm') {
        return deleteEntry(sock, msg, subArgs, extra);
      }

      return extra.reply(
        `❌ ERROR\n\nUnknown command: ${sub}\n\nUse .db help for available commands`
      );

    } catch (error) {
      console.error('DB command error:', error);
      await extra.reply(`❌ ERROR\n\n${error.message}`);
    }
  }
};

async function showHelp(sock, msg, extra) {
  const text = [
    `🗄️ *DATABASE MANAGER*`,
    ``,
    `📊 *INFO*`,
    `• .db stats — overview of all tables`,
    `• .db view <table> — view table contents`,
    ``,
    `🔍 *SEARCH*`,
    `• .db search <table> <query> — search table`,
    ``,
    `✏️ *EDIT*`,
    `• .db edit <table> <key> <field> <value>`,
    `• .db delete <table> <key> — delete entry`,
    ``,
    `⚠️ *DANGER*`,
    `• .db reset <table> — clear entire table`,
    `• .db backup — backup database`,
    ``,
    `📋 *Tables:* ${Object.keys(TABLES).join(', ')}`,
    ``,
    `_${pick(SLANG.vibe)} — handle with care_`
  ].join('\n');

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

async function viewTable(sock, msg, args, extra) {
  const tableName = (args[0] || '').toLowerCase();

  if (!tableName || !TABLES[tableName]) {
    return extra.reply(
      `❌ ERROR\n\nSpecify a table: ${Object.keys(TABLES).join(', ')}`
    );
  }

  const filePath = path.join(DB_PATH, TABLES[tableName].file);
  if (!fs.existsSync(filePath)) {
    return extra.reply(`❌ ERROR\n\nTable "${tableName}" doesn't exist yet`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const keys = Object.keys(data);
  const size = (fs.statSync(filePath).size / 1024).toFixed(1);

  let text = `🗄️ *${tableName.toUpperCase()}*\n`;
  text += `📊 ${keys.length} entries | ${size}KB\n`;
  text += `----------\n`;

  // Show summary based on table type
  if (tableName === 'groups') {
    for (const [jid, settings] of Object.entries(data).slice(0, 10)) {
      const features = [];
      if (settings.antilink) features.push('antilink');
      if (settings.antibadword) features.push('antibadword');
      if (settings.welcome) features.push('welcome');
      if (settings.slowmode > 0) features.push(`slow:${settings.slowmode}s`);
      text += `\n👥 ${jid.split('@')[0]}`;
      if (features.length) text += ` — ${features.join(', ')}`;
    }
  } else if (tableName === 'warnings') {
    for (const [jid, warns] of Object.entries(data).slice(0, 10)) {
      const count = Array.isArray(warns) ? warns.length : (warns.count || 0);
      text += `\n⚠️ ${jid.split('@')[0]} — ${count} warnings`;
    }
  } else if (tableName === 'crew') {
    const groups = Object.keys(data);
    let totalMembers = 0;
    let totalEvents = 0;
    let totalApplicants = 0;
    for (const groupJid of groups) {
      const g = data[groupJid];
      totalMembers += Object.keys(g.members || {}).length;
      totalEvents += Object.keys(g.events || {}).length;
      totalApplicants += Object.keys(g.applicants || {}).length;
    }
    text += `\n👥 Total Members: ${totalMembers}`;
    text += `\n📅 Total Events: ${totalEvents}`;
    text += `\n📋 Total Applicants: ${totalApplicants}`;
    text += `\n----------`;
    for (const [groupJid, groupData] of Object.entries(data).slice(0, 10)) {
      const memberCount = Object.keys(groupData.members || {}).length;
      const eventCount = Object.keys(groupData.events || {}).length;
      const teamName = groupData.teamName || 'Unassigned';
      text += `\n🏢 ${groupJid.split('@')[0]} — ${teamName}`;
      text += `\n   👥 ${memberCount} members | 📅 ${eventCount} events`;
      for (const [jid, m] of Object.entries(groupData.members || {}).slice(0, 5)) {
        text += `\n   👤 ${jid.split('@')[0]} — ${m.role} (${m.team || 'no team'})`;
      }
      if (Object.keys(groupData.members || {}).length > 5) {
        text += `\n   ... +${Object.keys(groupData.members).length - 5} more`;
      }
    }
  } else if (tableName === 'global') {
    text += `\n🔒 Self Mode: ${data.selfMode ? 'ON' : 'OFF'}`;
    text += `\n✅ Approved: ${(data.approvedNumbers || []).length} numbers`;
  } else if (tableName === 'mods') {
    const mods = data.moderators || [];
    text += `\n🛡️ ${mods.length} moderators`;
    for (const jid of mods.slice(0, 10)) {
      text += `\n• ${jid.split('@')[0]}`;
    }
  } else {
    // Generic view
    for (const [key, val] of Object.entries(data).slice(0, 10)) {
      const preview = typeof val === 'object' ? JSON.stringify(val).substring(0, 50) : String(val).substring(0, 50);
      text += `\n• ${key}: ${preview}`;
    }
  }

  if (keys.length > 10) {
    text += `\n\n... +${keys.length - 10} more`;
  }

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

async function showStats(sock, msg, extra) {
  let text = `🗄️ *DATABASE STATS*\n`;
  text += `----------\n`;

  let totalSize = 0;
  let totalEntries = 0;

  for (const [name, info] of Object.entries(TABLES)) {
    const filePath = path.join(DB_PATH, info.file);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const size = fs.statSync(filePath).size;
      const entries = Array.isArray(data) ? data.length : Object.keys(data).length;
      totalSize += size;
      totalEntries += entries;
      text += `\n📋 *${name}* — ${entries} entries (${(size / 1024).toFixed(1)}KB)`;
    } else {
      text += `\n📋 *${name}* — not created`;
    }
  }

  text += `\n----------\n`;
  text += `\n💾 Total: ${(totalSize / 1024).toFixed(1)}KB | ${totalEntries} entries`;

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

async function backupDb(sock, msg, extra) {
  const backupDir = path.join(__dirname, '..', '..', 'database', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  let backedUp = 0;

  for (const [name, info] of Object.entries(TABLES)) {
    const src = path.join(DB_PATH, info.file);
    if (fs.existsSync(src)) {
      const dest = path.join(backupDir, `${name}_${timestamp}.json`);
      fs.copyFileSync(src, dest);
      backedUp++;
    }
  }

  await sock.sendMessage(extra.from, {
    text: `✅ SUCCESS\n\n🗄️ BACKUP COMPLETE\n\n📁 ${backedUp} tables backed up\n📂 Location: database/backups/\n⏰ ${new Date().toLocaleString('en-ZA')}`
  }, { quoted: msg });
}

async function resetTable(sock, msg, args, extra) {
  const tableName = (args[0] || '').toLowerCase();

  if (!tableName || !TABLES[tableName]) {
    return extra.reply(
      `❌ ERROR\n\nSpecify a table: ${Object.keys(TABLES).join(', ')}`
    );
  }

  // Safety check
  if (args[1] !== 'confirm') {
    return extra.reply(
      `⚠️ WARNING\n\nThis will CLEAR all data in "${tableName}"\n\n` +
      `Type .db reset ${tableName} confirm to proceed\n\n` +
      `_This cannot be undone, ${pick(SLANG.vibe)}_`
    );
  }

  const filePath = path.join(DB_PATH, TABLES[tableName].file);
  const defaults = {
    'groups': {},
    'users': {},
    'warnings': {},
    'mods': { moderators: [] },
    'crew': {},
    'global': { selfMode: false, approvedNumbers: [] }
  };

  fs.writeFileSync(filePath, JSON.stringify(defaults[tableName] || {}, null, 2));

  await sock.sendMessage(extra.from, {
    text: `✅ SUCCESS\n\n🗑️ TABLE RESET\n\n📋 *${tableName}* has been cleared`
  }, { quoted: msg });
}

async function searchDb(sock, msg, args, extra) {
  const tableName = (args[0] || '').toLowerCase();
  const query = args.slice(1).join(' ').toLowerCase();

  if (!tableName || !TABLES[tableName]) {
    return extra.reply(`❌ ERROR\n\nSpecify a table: ${Object.keys(TABLES).join(', ')}`);
  }

  if (!query) {
    return extra.reply(`❌ ERROR\n\nUsage: .db search <table> <query>`);
  }

  const filePath = path.join(DB_PATH, TABLES[tableName].file);
  if (!fs.existsSync(filePath)) {
    return extra.reply(`❌ ERROR\n\nTable "${tableName}" doesn't exist`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const results = [];

  for (const [key, val] of Object.entries(data)) {
    const searchStr = JSON.stringify(val).toLowerCase();
    if (key.toLowerCase().includes(query) || searchStr.includes(query)) {
      results.push({ key, val });
    }
  }

  if (results.length === 0) {
    return extra.reply(`🔍 SEARCH\n\nNo results for "${query}" in ${tableName}`);
  }

  let text = `🔍 *SEARCH RESULTS*\n`;
  text += `📋 Table: ${tableName} | Query: "${query}"\n`;
  text += `📊 Found: ${results.length}\n`;
  text += `----------\n`;

  for (const { key, val } of results.slice(0, 10)) {
    const preview = typeof val === 'object' ? JSON.stringify(val).substring(0, 80) : String(val).substring(0, 80);
    text += `\n• *${key}*: ${preview}`;
  }

  await sock.sendMessage(extra.from, { text }, { quoted: msg });
}

async function editEntry(sock, msg, args, extra) {
  const [tableName, key, field, ...valueParts] = args;
  const value = valueParts.join(' ');

  if (!tableName || !key || !field || !value) {
    return extra.reply(
      `❌ ERROR\n\nUsage: .db edit <table> <key> <field> <value>\n\n` +
      `Example: .db edit crew 27833882383@s.whatsapp.net role leader`
    );
  }

  if (!TABLES[tableName]) {
    return extra.reply(`❌ ERROR\n\nInvalid table: ${Object.keys(TABLES).join(', ')}`);
  }

  const filePath = path.join(DB_PATH, TABLES[tableName].file);
  if (!fs.existsSync(filePath)) {
    return extra.reply(`❌ ERROR\n\nTable "${tableName}" doesn't exist`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (!data[key]) {
    return extra.reply(`❌ ERROR\n\nKey "${key}" not found in ${tableName}`);
  }

  // Parse value
  let parsed = value;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (!isNaN(value)) parsed = Number(value);

  const oldValue = data[key][field];
  data[key][field] = parsed;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  await sock.sendMessage(extra.from, {
    text: `✅ SUCCESS\n\n✏️ ENTRY EDITED\n\n📋 Table: ${tableName}\n🔑 Key: ${key}\n📝 ${field}: ${oldValue} → ${parsed}`
  }, { quoted: msg });
}

async function deleteEntry(sock, msg, args, extra) {
  const tableName = (args[0] || '').toLowerCase();
  const key = args[1];

  if (!tableName || !key) {
    return extra.reply(
      `❌ ERROR\n\nUsage: .db delete <table> <key>`
    );
  }

  if (!TABLES[tableName]) {
    return extra.reply(`❌ ERROR\n\nInvalid table: ${Object.keys(TABLES).join(', ')}`);
  }

  const filePath = path.join(DB_PATH, TABLES[tableName].file);
  if (!fs.existsSync(filePath)) {
    return extra.reply(`❌ ERROR\n\nTable "${tableName}" doesn't exist`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (!data[key]) {
    return extra.reply(`❌ ERROR\n\nKey "${key}" not found in ${tableName}`);
  }

  delete data[key];
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  await sock.sendMessage(extra.from, {
    text: `✅ SUCCESS\n\n🗑️ ENTRY DELETED\n\n📋 Table: ${tableName}\n🔑 Key: ${key}`
  }, { quoted: msg });
}

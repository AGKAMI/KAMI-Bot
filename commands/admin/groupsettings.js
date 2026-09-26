/**
 * Group Settings Dashboard — one message, toggle buttons for every group setting.
 * Usage: .settings
 * Each press flips the setting and re-sends the dashboard so labels update.
 */

const config = require('../../config');
const database = require('../../database');
const { pick, SLANG } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

const TOGGLES = [
  { key: 'antiflood',       label: 'Anti-Flood' },
  { key: 'antilink',        label: 'Anti-Link' },
  { key: 'antibadword',     label: 'Anti-Badword' },
  { key: 'antitag',         label: 'Anti-Tag' },
  { key: 'antigroupmention', label: 'Anti-GroupMention' },
  { key: 'welcome',         label: 'Welcome Msgs' },
  { key: 'goodbye',         label: 'Goodbye Msgs' },
  { key: 'autosticker',     label: 'Auto-Sticker' },
];

function buildDashboardText(settings) {
  const actions = [];
  if (settings.antiflood) actions.push(`Anti-flood: ${settings.antifloodAction || 'warn'}`);
  if (settings.antilink) actions.push(`Anti-link: ${settings.antilinkAction || 'delete'}`);
  if (settings.antitag) actions.push(`Anti-tag: ${settings.antitagAction || 'delete'}`);
  if (settings.antigroupmention) actions.push(`Anti-groupmention: ${settings.antigroupmentionAction || 'delete'}`);
  if (settings.slowmode) actions.push(`Slowmode: ${settings.slowmode}s`);

  return (
    `⚙️ *GROUP SETTINGS*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Tap a button to flip it:\n\n` +
    (actions.length > 0 ? `🔧 *Active actions:*\n${actions.map(a => `  • ${a}`).join('\n')}\n\n` : '') +
    `_Show extra actions with the individual commands (${config.prefix || '.'}antiflood set <action> etc.)_`
  );
}

async function sendDashboard(sock, chatId, quoted) {
  const settings = database.getGroupSettings(chatId);
  const buttons = TOGGLES.map(t => ({
    id: `admin:settings:toggle:${t.key}`,
    text: `${settings[t.key] ? '✅' : '❌'} ${t.label}`,
  }));

  await sendButtons(sock, chatId, {
    text: buildDashboardText(settings),
    footer: config.botName || 'KAMI Bot',
    buttons,
  }, quoted);
}

module.exports = {
  name: 'settings',
  reactions: { received: '⚙️', done: '🧰' },
  aliases: ['groupsettings', 'toggles'],
  category: 'admin',
  description: 'One-message dashboard: toggle every group setting',
  usage: '.settings',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      await sendDashboard(sock, extra.from, msg);
    } catch (error) {
      console.error('Settings error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  },
};

// ── Toggle handler ───────────────────────────────────────────
// admin:settings prefix → covered by the central requireAdmin('admin') check
onButton('admin:settings:toggle:', async (sock, msg, from, sender, btnId) => {
  const key = btnId.replace('admin:settings:toggle:', '');
  const toggle = TOGGLES.find(t => t.key === key);
  if (!toggle) return;

  const settings = database.getGroupSettings(from);
  const newValue = !settings[key];
  database.updateGroupSettings(from, { [key]: newValue });

  await sock.sendMessage(from, {
    text: `${newValue ? '✅' : '❌'} *${toggle.label.toUpperCase()} ${newValue ? 'ON' : 'OFF'}*`,
  }, { quoted: msg });

  // Re-send the dashboard so the labels update
  await sendDashboard(sock, from);
});

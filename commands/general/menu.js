const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');
const { sendButtons, onButton, isButtonModeOn } = require('../../utils/buttonHelper');
const { normalizeJidWithLid } = require('../../utils/jidHelper');
const { canonicalNumber } = require('../../database');
const fs = require('fs');
const path = require('path');

// Cache commands — only scan filesystem once at module load
let _cachedCommands = null;
const getCommands = () => {
  if (!_cachedCommands) _cachedCommands = loadCommands();
  return _cachedCommands;
};

const categoryMeta = {
  general:   { emoji: '🏠', label: 'General' },
  ai:        { emoji: '🤖', label: 'AI' },
  media:     { emoji: '🎬', label: 'Media' },
  fun:       { emoji: '🎉', label: 'Fun' },
  games:     { emoji: '🎮', label: 'Games' },
  utility:   { emoji: '🔧', label: 'Utility' },
  anime:     { emoji: '⛩️', label: 'Anime' },
  textmaker: { emoji: '✨', label: 'Text Maker' },
  admin:     { emoji: '🛡️', label: 'Admin' },
  crew:      { emoji: '🔰', label: 'Crew' },
  owner:     { emoji: '👑', label: 'Owner' },
};

const order = ['general', 'ai', 'media', 'fun', 'games', 'utility', 'anime', 'textmaker', 'admin', 'crew', 'owner'];

function buildCategoryText(cat, opts = {}) {
  const prefix = config.prefix || '.';
  const commands = getCommands();
  const meta = categoryMeta[cat] || { emoji: '📁', label: cat };
  const items = [];
  commands.forEach((cmd, name) => {
    if (cmd.name === name && cmd.category === cat) items.push(cmd);
  });
  items.sort((a, b) => a.name.localeCompare(b.name));

  let text = `${meta.emoji} *${meta.label.toUpperCase()}*\n`;
  text += `----------\n`;
  for (const cmd of items) {
    text += `${prefix}${cmd.name}${cmd.description ? ` — \`${cmd.description}\`` : ''}\n`;
  }
  if (items.length === 0) text += `_No commands here yet, ${voice.tag('err')}_`;
  text += `\n----------\n`;
  // Button views carry a Back button — but if it falls back to plain text
  // (button mode off / rate-limited), the typed path must be spelled out.
  text += opts.nav
    ? `_Tap ⬅️ Back for the menu or type ${prefix}menu · ${prefix}help <cmd> for info_`
    : `_Use ${prefix}help <cmd> for info_`;
  return text;
}

function buildFullMenu(pushName) {
  const prefix = config.prefix || '.';
  const commands = getCommands();
  const categories = {};
  commands.forEach((cmd, name) => {
    if (cmd.name === name) {
      if (!categories[cmd.category]) categories[cmd.category] = [];
      categories[cmd.category].push(cmd);
    }
  });
  const total = commands.size;
  const line = () => '----------';

  let text = '';
  text += `*KAMI BOT*\n`;
  text += `${line(20)}\n\n`;
  text += `*HOWZIT* ${pushName || 'User'}! 👋\n`;
  text += `${total} *commands* available\n`;
  text += `Prefix: ${bold(prefix)}\n\n`;

  for (const cat of order) {
    const list = categories[cat];
    if (!list || list.length === 0) continue;
    const meta = categoryMeta[cat];
    const sorted = list.filter(item => item.name).sort((a, b) => a.name.localeCompare(b.name));
    text += `${meta.emoji} *${meta.label.toUpperCase()}*\n`;
    text += `${line(15)}\n`;
    for (const cmd of sorted) {
      text += `${prefix}${cmd.name}${cmd.description ? ` — \`${cmd.description}\`` : ''}\n`;
    }
    text += '\n';
  }

  text += `${line(20)}\n`;
  text += `_Use ${prefix}help <cmd> for info_`;
  return text;
}

module.exports = {
  name: 'menu',
  reactions: { received: '📖', done: '📋' },
  aliases: ['commands'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const prefix = config.prefix || '.';
      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      const newsletterJid = config.newsletterJid || '';
      const newsletterCtx = newsletterJid ? {
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid,
            newsletterName: config.botName || 'KAMI Bot',
            serverMessageId: -1,
          },
        },
      } : {};

      // .menu <category> → show just that category
      const requested = (args[0] || '').toLowerCase();
      if (requested && requested !== 'all' && categoryMeta[requested]) {
        return extra.reply(buildCategoryText(requested));
      }

      // Button mode ON → compact menu + category buttons (easier to use)
      // NOTE: no newsletter ctx — buttons don't work with it, so image + buttons = single message
      if (isButtonModeOn() && requested !== 'all') {
        const summary = [
          `*KAMI BOT* ${voice.greetOpen()}! 👋`,
          ``,
          `🤖 Hit a button and I'll show you that section 👇`,
          ``,
          `📖 Full list: *${prefix}menu all*`,
        ].join('\n');

        const btnFooter = config.botName || 'KAMI Bot';

        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          await sock.sendMessage(extra.from, {
            image: imageBuffer,
            caption: summary,
            mentions: [extra.sender],
          }, { quoted: msg });
          // Send buttons separately — body text must be non-empty for buttons to render
          await sendButtons(sock, extra.from, {
            text: '👇 Tap a button below',
            footer: btnFooter,
            buttons: mainBtns,
          });
        } else {
          await sendButtons(sock, extra.from, {
            text: summary,
            footer: btnFooter,
            header: 'KAMI BOT',
            buttons: mainBtns,
          }, msg);
        }
        return;
      }

      // Button mode OFF → full text menu (original behavior)
      const text = buildFullMenu(extra.pushName);
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        await sock.sendMessage(extra.from, {
          image: imageBuffer,
          caption: text,
          mentions: [extra.sender],
          ...newsletterCtx,
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: text,
          mentions: [extra.sender],
          ...newsletterCtx,
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('[MENU] Error:', error);
      extra.fail();
      await extra.reply(`❌ _${voice.openErr()} — ${error.message}_`);
    }
  }
};

// Register button handlers (runs once at command load)
// Layout: main menu = category buttons + More; More = Anime/Textmaker/Back;
// every category view = command list + Back (parent-aware: More children go
// back to More, main categories go back to main). Also served when the same
// menu:* ids are pressed from start.js's `start:menu` layout.

const mainText = `*KAMI BOT* ${voice.greetOpen()}! 👋\n\n🤖 Hit a button for that section's commands 👇\n\n📖 Everything: *${config.prefix || '.'}menu all*`;
const mainBtns = [
  { id: 'menu:admin',   text: '🛡️ Admin' },
  { id: 'menu:crew',    text: '🔰 Crew' },
  { id: 'menu:general', text: '🏠 General' },
  { id: 'menu:ai',      text: '🤖 AI' },
  { id: 'menu:media',   text: '🎬 Media' },
  { id: 'menu:fun',     text: '🎉 Fun' },
  { id: 'menu:games',   text: '🎮 Games' },
  { id: 'menu:utility', text: '🔧 Utility' },
  { id: 'menu:owner',   text: '👑 Owner' },
  { id: 'menu:more',    text: '📂 More' },
];

const BACK_MAIN = { id: 'menu:back:main', text: '⬅️ Back to Menu' };
const BACK_MORE = { id: 'menu:back:more', text: '⬅️ Back to More' };

// Category view = the list WITH a Back button (never a dead end)
async function sendCategoryView(sock, from, cat, backBtn) {
  await sendButtons(sock, from, {
    text: buildCategoryText(cat, { nav: true }),
    footer: config.botName || 'KAMI Bot',
    buttons: [backBtn],
  });
}

// ── Main-page categories → Back to main menu ────────────
for (const b of mainBtns) {
  if (b.id === 'menu:owner' || b.id === 'menu:more') continue; // special-cased below
  const cat = b.id.slice('menu:'.length);
  onButton(b.id, (sock, msg, from) => sendCategoryView(sock, from, cat, BACK_MAIN));
}

// ── 👑 Owner button — only KAMI gets the owner command list; everyone else
// gets told plainly (with a Back button, so they're not stuck).
// Handles: fromMe taps (owner's own device), PN jids,
// LID participants (normalized), and config.ownerNumber stored as 083….
const isOwnerClicker = (msg, sender) => {
  if (msg && msg.key && msg.key.fromMe) return true;
  const jid = normalizeJidWithLid(sender) || sender || '';
  const digits = String(jid).split('@')[0].replace(/\D/g, '');
  if (!digits) return false;
  return (config.ownerNumber || []).some(o => canonicalNumber(o) === canonicalNumber(digits));
};

onButton('menu:owner', async (sock, msg, from, sender) => {
  const clicker = sender || (msg && msg.key && msg.key.participant) || from;
  if (!isOwnerClicker(msg, clicker)) {
    return sendButtons(sock, from, {
      text: `👑 *KAMI ONLY*\n\n_Only KAMI has access to those commands._`,
      footer: config.botName || 'KAMI Bot',
      buttons: [BACK_MAIN],
    });
  }
  await sendCategoryView(sock, from, 'owner', BACK_MAIN);
});

// ── More page: Anime, Textmaker, Back ────────────────
async function sendMorePage(sock, from) {
  await sendButtons(sock, from, {
    text: `📂 *MORE*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    buttons: [
      { id: 'menu:anime',     text: '⛩️ Anime' },
      { id: 'menu:textmaker', text: '✨ Textmaker' },
      BACK_MAIN,
    ],
  });
}
onButton('menu:more', (sock, msg, from) => sendMorePage(sock, from));
onButton('menu:back:more', (sock, msg, from) => sendMorePage(sock, from)); // children's parent-aware Back

// More-page children → Back returns to the More page, not the main menu
onButton('menu:anime', (sock, msg, from) => sendCategoryView(sock, from, 'anime', BACK_MORE));
onButton('menu:textmaker', (sock, msg, from) => sendCategoryView(sock, from, 'textmaker', BACK_MORE));

// ── Back to Main Menu ────────────────────────────────
onButton('menu:back:main', (sock, msg, from) => sendButtons(sock, from, {
  text: mainText,
  footer: config.botName || 'KAMI Bot',
  header: 'KAMI BOT',
  buttons: mainBtns,
}));
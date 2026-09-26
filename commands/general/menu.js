const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const { sendButtons, onButton, isButtonModeOn } = require('../../utils/buttonHelper');
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

function buildCategoryText(cat) {
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
  if (items.length === 0) text += `_No commands here yet, ${pick(SLANG.vibe)}_`;
  text += `\n----------\n_Use ${prefix}help <cmd> for info_`;
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
          `*KAMI BOT* ${pick(SLANG.greeting)}! 👋`,
          ``,
          `🤖 Tap a button to see that section's commands 👇`,
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
      await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
    }
  }
};

// Register category button handlers (runs once at command load)
// Layout: msg1 = 3 buttons (2 categories + More), msg2 = Back (separate message)
// Last page: Owner + Back in one message (2 buttons)
// Category detail views = plain text, no buttons

const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
const mainText = `*KAMI BOT* ${pick(SLANG.greeting)}! 👋\n\n🤖 Tap a button to see that section's commands 👇\n\n📖 Full list: *${config.prefix || '.'}menu all*`;
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

// ── Category views (plain text) ──────────────────────
onButton('menu:admin', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('admin') });
});
onButton('menu:crew', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('crew') });
});
onButton('menu:general', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('general') });
});
onButton('menu:ai', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('ai') });
});
onButton('menu:media', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('media') });
});
onButton('menu:fun', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('fun') });
});
onButton('menu:games', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('games') });
});
onButton('menu:utility', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('utility') });
});
onButton('menu:owner', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('owner') });
});

// ── More page: Anime, Textmaker, Back ────────────────
onButton('menu:more', async (sock, msg, from) => {
  await sendBtns(sock, from, {
    text: `📂 *MORE*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    buttons: [
      { id: 'menu:anime',     text: '⛩️ Anime' },
      { id: 'menu:textmaker', text: '✨ Textmaker' },
      { id: 'menu:back:main', text: '⬅️ Back to Menu' },
    ],
  });
});
onButton('menu:anime', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('anime') });
});
onButton('menu:textmaker', (sock, msg, from) => {
  sock.sendMessage(from, { text: buildCategoryText('textmaker') });
});

// ── Back to Main Menu ────────────────────────────────
onButton('menu:back:main', async (sock, msg, from) => {
  await sendBtns(sock, from, {
    text: mainText,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: mainBtns,
  });
});
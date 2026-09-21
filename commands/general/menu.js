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
  aliases: ['help', 'commands'],
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
      if (isButtonModeOn() && requested !== 'all') {
        const summary = [
          `*KAMI BOT* ${pick(SLANG.greeting)}! 👋`,
          ``,
          `🤖 Tap a button to see that section's commands 👇`,
          ``,
          `📖 Full list: *${prefix}menu all*`,
        ].join('\n');

        const buttons = [
          { id: 'menu:admin', text: '🛡️ Admin' },
          { id: 'menu:crew',  text: '🔰 Crew' },
          { id: 'menu:more1', text: '📂 More' },
        ];

        const btnFooter = config.botName || 'KAMI Bot';

        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          await sock.sendMessage(extra.from, {
            image: imageBuffer,
            mentions: [extra.sender],
            ...newsletterCtx,
          }, { quoted: msg });
        }
        await sendButtons(sock, extra.from, {
          text: summary,
          footer: btnFooter,
          header: 'KAMI BOT',
          buttons,
        }, msg);
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

// ── Page 1: Main Menu ────────────────────────────────
onButton('menu:admin', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('admin'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:main', text: '⬅️ Back to Menu' }],
  });
});
onButton('menu:crew', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('crew'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:main', text: '⬅️ Back to Menu' }],
  });
});

// ── Page 2: General, AI, Media + Back ────────────────
onButton('menu:more1', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `📂 *GENERAL / AI / MEDIA*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:general', text: '🏠 General' },
      { id: 'menu:ai',      text: '🤖 AI' },
      { id: 'menu:media',   text: '🎬 Media' },
    ],
  });
});
onButton('menu:general', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('general'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:more1', text: '⬅️ Back' }],
  });
});
onButton('menu:ai', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('ai'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:more1', text: '⬅️ Back' }],
  });
});

// ── Page 3: Fun, Games, Utility + Back ───────────────
onButton('menu:more2', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `📂 *FUN / GAMES / UTILITY*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:fun',      text: '🎉 Fun' },
      { id: 'menu:games',    text: '🎮 Games' },
      { id: 'menu:utility',  text: '🔧 Utility' },
    ],
  });
});
onButton('menu:fun', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('fun'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:more2', text: '⬅️ Back' }],
  });
});
onButton('menu:games', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('games'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:more2', text: '⬅️ Back' }],
  });
});
onButton('menu:utility', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('utility'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:more2', text: '⬅️ Back' }],
  });
});

// ── Page 4: Anime, Textmaker, Owner + Back ───────────
onButton('menu:more3', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `📂 *ANIME / TEXTMAKER / OWNER*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:anime',     text: '⛩️ Anime' },
      { id: 'menu:textmaker', text: '✨ Textmaker' },
      { id: 'menu:owner',     text: '👑 Owner' },
    ],
  });
});
onButton('menu:anime', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('anime'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:more3', text: '⬅️ Back' }],
  });
});
onButton('menu:textmaker', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('textmaker'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:more3', text: '⬅️ Back' }],
  });
});
onButton('menu:owner', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: buildCategoryText('owner'),
    footer: config.botName || 'KAMI Bot',
    buttons: [{ id: 'menu:back:more3', text: '⬅️ Back' }],
  });
});

// ── Back Navigation Handlers ─────────────────────────
onButton('menu:back:main', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `*KAMI BOT* ${pick(SLANG.greeting)}! 👋\n\n🤖 Tap a button to see that section's commands 👇\n\n📖 Full list: *${config.prefix || '.'}menu all*`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:admin', text: '🛡️ Admin' },
      { id: 'menu:crew',  text: '🔰 Crew' },
      { id: 'menu:more1', text: '📂 More' },
    ],
  });
});
onButton('menu:back:more1', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `📂 *GENERAL / AI / MEDIA*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:general', text: '🏠 General' },
      { id: 'menu:ai',      text: '🤖 AI' },
      { id: 'menu:media',   text: '🎬 Media' },
    ],
  });
});
onButton('menu:back:more2', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `📂 *FUN / GAMES / UTILITY*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:fun',      text: '🎉 Fun' },
      { id: 'menu:games',    text: '🎮 Games' },
      { id: 'menu:utility',  text: '🔧 Utility' },
    ],
  });
});
onButton('menu:back:more3', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `📂 *ANIME / TEXTMAKER / OWNER*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:anime',     text: '⛩️ Anime' },
      { id: 'menu:textmaker', text: '✨ Textmaker' },
      { id: 'menu:owner',     text: '👑 Owner' },
    ],
  });
});
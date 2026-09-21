const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { bold, italic, pick, SLANG } = require('../../utils/format');
const { sendButtons, onButton, isButtonModeOn } = require('../../utils/buttonHelper');
const fs = require('fs');
const path = require('path');

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

// ── Quick commands — buttons that run commands directly ──────
const quickCommands = {
  admin: [
    { id: 'run:.kick @user',    text: '🔨 Kick' },
    { id: 'run:.demote @user',  text: '⬇️ Demote' },
    { id: 'run:.warn @user',    text: '⚠️ Warn' },
  ],
  crew: [
    { id: 'run:.crew apply',    text: '📝 Apply' },
    { id: 'run:.crew applicants', text: '📋 Applicants' },
    { id: 'run:.crew teams',    text: '👥 Teams' },
  ],
  general: [
    { id: 'run:.ping',          text: '📡 Ping' },
    { id: 'run:.menu',          text: '📖 Menu' },
    { id: 'run:.sticker',       text: '🎨 Sticker' },
  ],
  media: [
    { id: 'run:.tt',            text: '🎵 TikTok' },
    { id: 'run:.ig',            text: '📸 Instagram' },
    { id: 'run:.song',          text: '🎶 Song' },
  ],
  fun: [
    { id: 'run:.meme',          text: '😂 Meme' },
    { id: 'run:.joke',          text: '🤣 Joke' },
    { id: 'run:.ship',          text: '💕 Ship' },
  ],
  games: [
    { id: 'run:.ttt',           text: '❌ TicTacToe' },
    { id: 'run:.8ball',         text: '🎱 8Ball' },
    { id: 'run:.truth',         text: ' truths' },
  ],
  owner: [
    { id: 'run:.selfmode on',   text: '🔒 Self Mode' },
    { id: 'run:.approve',       text: '✅ Approve' },
    { id: 'run:.broadcast',     text: '📢 Broadcast' },
  ],
};

function buildCategoryText(cat) {
  const prefix = config.prefix || '.';
  const commands = loadCommands();
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
  text += `\n----------\n_Tap a button below or use ${prefix}help <cmd>_`;
  return text;
}

function buildFullMenu(pushName) {
  const prefix = config.prefix || '.';
  const commands = loadCommands();
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
        // If button mode on, show category with action buttons
        if (isButtonModeOn()) {
          const catText = buildCategoryText(requested);
          const catButtons = (quickCommands[requested] || []).slice(0, 3);
          if (catButtons.length > 0) {
            await sock.sendMessage(extra.from, { text: catText, ...newsletterCtx });
            await sendButtons(sock, extra.from, {
              text: `Tap to run a command:`,
              footer: `${categoryMeta[requested]?.label || requested}`,
              buttons: [
                ...catButtons,
                { id: 'menu:back', text: '⬅️ Back' },
              ],
            }, msg);
            return;
          }
        }
        return extra.reply(buildCategoryText(requested));
      }

      // Button mode ON → compact menu + category buttons
      if (isButtonModeOn() && requested !== 'all') {
        const summary = [
          `*KAMI BOT* ${pick(SLANG.greeting)}! 👋`,
          ``,
          `🤖 Tap a button to browse commands 👇`,
          ``,
          `📖 Full list: *${prefix}menu all*`,
        ].join('\n');

        const buttons = [
          { id: 'menu:admin', text: '🛡️ Admin' },
          { id: 'menu:crew',  text: '🔰 Crew' },
          { id: 'menu:more',  text: '📂 More' },
        ];

        const btnFooter = config.botName || 'KAMI Bot';

        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          await sock.sendMessage(extra.from, {
            image: imageBuffer,
            caption: summary,
            mentions: [extra.sender],
            ...newsletterCtx,
          }, { quoted: msg });
          await sendButtons(sock, extra.from, {
            text: `📖 Full list: *${prefix}menu all*`,
            footer: btnFooter,
            header: 'KAMI BOT',
            buttons,
          }, msg);
        } else {
          await sendButtons(sock, extra.from, {
            text: summary,
            footer: btnFooter,
            header: 'KAMI BOT',
            buttons,
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

// ── Button Handlers ──────────────────────────────────────────

// Run a command directly from button tap
onButton('run:', async (sock, msg, from, sender, btnId) => {
  const prefix = config.prefix || '.';
  const cmdText = btnId.replace('run:', '');
  // Execute as if the user typed it
  const fakeMsg = {
    key: { remoteJid: from, participant: sender, id: 'btn_' + Date.now() },
    message: { conversation: cmdText },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
  const handler = require('../../handler');
  await handler.handleMessage(sock, fakeMsg);
});

// Category navigation buttons
onButton('menu:admin', async (sock, msg, from) => {
  const prefix = config.prefix || '.';
  const catText = buildCategoryText('admin');
  const buttons = (quickCommands.admin || []).slice(0, 3);
  await sock.sendMessage(from, { text: catText });
  if (buttons.length > 0) {
    await sendButtons(sock, from, {
      text: `Tap to run:`,
      footer: 'Admin',
      buttons: [...buttons, { id: 'menu:back', text: '⬅️ Back' }],
    });
  }
});

onButton('menu:crew', async (sock, msg, from) => {
  const catText = buildCategoryText('crew');
  const buttons = (quickCommands.crew || []).slice(0, 3);
  await sock.sendMessage(from, { text: catText });
  if (buttons.length > 0) {
    await sendButtons(sock, from, {
      text: `Tap to run:`,
      footer: 'Crew',
      buttons: [...buttons, { id: 'menu:back', text: '⬅️ Back' }],
    });
  }
});

onButton('menu:owner', async (sock, msg, from) => {
  const catText = buildCategoryText('owner');
  const buttons = (quickCommands.owner || []).slice(0, 3);
  await sock.sendMessage(from, { text: catText });
  if (buttons.length > 0) {
    await sendButtons(sock, from, {
      text: `Tap to run:`,
      footer: 'Owner',
      buttons: [...buttons, { id: 'menu:back', text: '⬅️ Back' }],
    });
  }
});

onButton('menu:media', async (sock, msg, from) => {
  const catText = buildCategoryText('media');
  const buttons = (quickCommands.media || []).slice(0, 3);
  await sock.sendMessage(from, { text: catText });
  if (buttons.length > 0) {
    await sendButtons(sock, from, {
      text: `Tap to run:`,
      footer: 'Media',
      buttons: [...buttons, { id: 'menu:more-back', text: '⬅️ Back' }],
    });
  }
});

onButton('menu:fun', async (sock, msg, from) => {
  const catText = buildCategoryText('fun');
  const buttons = (quickCommands.fun || []).slice(0, 3);
  await sock.sendMessage(from, { text: catText });
  if (buttons.length > 0) {
    await sendButtons(sock, from, {
      text: `Tap to run:`,
      footer: 'Fun',
      buttons: [...buttons, { id: 'menu:more-back', text: '⬅️ Back' }],
    });
  }
});

onButton('menu:games', async (sock, msg, from) => {
  const catText = buildCategoryText('games');
  const buttons = (quickCommands.games || []).slice(0, 3);
  await sock.sendMessage(from, { text: catText });
  if (buttons.length > 0) {
    await sendButtons(sock, from, {
      text: `Tap to run:`,
      footer: 'Games',
      buttons: [...buttons, { id: 'menu:more-back', text: '⬅️ Back' }],
    });
  }
});

// Back button → return to main category menu
onButton('menu:back', async (sock, msg, from) => {
  const prefix = config.prefix || '.';
  await sendButtons(sock, from, {
    text: `*KAMI BOT*\n\n🤖 Pick a category:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:admin', text: '🛡️ Admin' },
      { id: 'menu:crew',  text: '🔰 Crew' },
      { id: 'menu:more',  text: '📂 More' },
    ],
  });
});

// Back from More → return to More categories
onButton('menu:more-back', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `📂 *MORE CATEGORIES*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:media',   text: '🎬 Media' },
      { id: 'menu:fun',     text: '🎉 Fun' },
      { id: 'menu:games',   text: '🎮 Games' },
    ],
  });
});

// More categories page
onButton('menu:more', async (sock, msg, from) => {
  const { sendButtons: sendBtns } = require('../../utils/buttonHelper');
  await sendBtns(sock, from, {
    text: `📂 *MORE CATEGORIES*\n\nTap to see commands:`,
    footer: config.botName || 'KAMI Bot',
    header: 'KAMI BOT',
    buttons: [
      { id: 'menu:media',   text: '🎬 Media' },
      { id: 'menu:fun',     text: '🎉 Fun' },
      { id: 'menu:games',   text: '🎮 Games' },
    ],
  });
});

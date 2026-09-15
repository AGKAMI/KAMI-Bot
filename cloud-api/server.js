const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'kami-cloud-api-verify';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const API_BASE = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}`;

// ─── Webhook Verification ───
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── Webhook Event Handler ───
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  if (!changes) return;

  const value = changes.value;
  const messages = value.messages;
  if (!messages || messages.length === 0) return;

  const msg = messages[0];
  const from = msg.from;
  const type = msg.type;

  console.log(`[MSG] From: ${from} | Type: ${type}`);

  // Handle interactive list responses
  if (type === 'interactive') {
    const interactive = msg.interactive;
    if (interactive.type === 'list_reply') {
      const selectedId = interactive.list_reply.id;
      console.log(`[LIST] Selected: ${selectedId}`);
      await handleListSelection(from, selectedId);
    } else if (interactive.type === 'button_reply') {
      const selectedId = interactive.button_reply.id;
      console.log(`[BUTTON] Selected: ${selectedId}`);
      await handleButtonSelection(from, selectedId);
    }
  }

  // Handle text commands
  if (type === 'text') {
    const text = msg.text.body.trim().toLowerCase();
    console.log(`[TEXT] "${text}" from ${from}`);

    if (text === '.menu' || text === 'menu') {
      await sendInteractiveMenu(from);
    } else if (text.startsWith('.help ')) {
      const cmd = text.replace('.help ', '');
      await sendHelp(from, cmd);
    } else if (text === '.status' || text === 'status') {
      await sendText(from, '✅ Bot is running on Cloud API');
    } else {
      // Forward unknown commands to Baileys bot (you can implement this later)
      await sendText(from, `Send *.menu* to see available commands`);
    }
  }
});

// ─── Send Text Message ───
async function sendText(to, text) {
  try {
    await axios.post(`${API_BASE}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    }, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('[ERROR] sendText:', err.response?.data || err.message);
  }
}

// ─── Send Interactive List Menu ───
async function sendInteractiveMenu(to) {
  try {
    await axios.post(`${API_BASE}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: '🔰 KAMI Bot Menu'
        },
        body: {
          text: 'Select a category to see available commands:'
        },
        footer: {
          text: 'Powered by KAMI Bot'
        },
        action: {
          button: '📋 Browse Commands',
          sections: [
            {
              title: '🎵 Media',
              rows: [
                { id: 'cmd_tiktok', title: '.tt <url>', description: 'Download TikTok videos' },
                { id: 'cmd_instagram', title: '.ig <url>', description: 'Download Instagram posts' },
                { id: 'cmd_facebook', title: '.fb <url>', description: 'Download Facebook videos' },
                { id: 'cmd_pinterest', title: '.pin <query>', description: 'Search Pinterest' },
                { id: 'cmd_song', title: '.song <query>', description: 'Download YouTube audio' },
                { id: 'cmd_video', title: '.video <query>', description: 'Download YouTube video' },
                { id: 'cmd_lyrics', title: '.lyrics <song>', description: 'Find song lyrics' }
              ]
            },
            {
              title: '🎨 Tools',
              rows: [
                { id: 'cmd_sticker', title: '.sticker', description: 'Convert image to sticker' },
                { id: 'cmd_trt', title: '.trt <text>', description: 'Translate text' },
                { id: 'cmd_calc', title: '.calc <math>', description: 'Calculator' },
                { id: 'cmd_weather', title: '.weather <city>', description: 'Weather forecast' },
                { id: 'cmd_tts', title: '.tts <text>', description: 'Text to speech' },
                { id: 'cmd_imagine', title: '.imagine <prompt>', description: 'Generate AI image' }
              ]
            },
            {
              title: '🎮 Fun',
              rows: [
                { id: 'cmd_meme', title: '.meme', description: 'Random meme' },
                { id: 'cmd_joke', title: '.joke', description: 'Random joke' },
                { id: 'cmd_ship', title: '.ship @user', description: 'Ship two users' },
                { id: 'cmd_flirt', title: '.flirt', description: 'Flirty pickup line' },
                { id: 'cmd_compliment', title: '.compliment', description: 'Random compliment' },
                { id: 'cmd_insult', title: '.insult', description: 'Roast someone' }
              ]
            },
            {
              title: '🎮 Games',
              rows: [
                { id: 'cmd_ttt', title: '.ttt @user', description: 'Tic Tac Toe' },
                { id: 'cmd_8ball', title: '.8ball <question>', description: 'Magic 8-ball' },
                { id: 'cmd_truth', title: '.truth', description: 'Truth question' },
                { id: 'cmd_dare', title: '.dare', description: 'Dare challenge' }
              ]
            },
            {
              title: 'ℹ️ Info',
              rows: [
                { id: 'cmd_menu', title: '.menu', description: 'Show this menu' },
                { id: 'cmd_help', title: '.help <cmd>', description: 'Command details' },
                { id: 'cmd_ping', title: '.ping', description: 'Bot latency' },
                { id: 'cmd_status', title: '.status', description: 'Bot status' }
              ]
            }
          ]
        }
      }
    }, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[MENU] Sent to ${to}`);
  } catch (err) {
    console.error('[ERROR] sendMenu:', err.response?.data || err.message);
  }
}

// ─── Send Interactive Buttons ───
async function sendButtons(to, text, buttons) {
  try {
    await axios.post(`${API_BASE}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text },
        action: buttons.map((b, i) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title }
        }))
      }
    }, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('[ERROR] sendButtons:', err.response?.data || err.message);
  }
}

// ─── Handle List Selections ───
async function handleListSelection(to, selectedId) {
  const commands = {
    // Media
    cmd_tiktok: '📥 *TikTok Download*\n\nUsage: `.tt <tiktok_url>`\n\nExample: `.tt https://vm.tiktok.com/...`',
    cmd_instagram: '📸 *Instagram Download*\n\nUsage: `.ig <instagram_url>`\n\nExample: `.ig https://instagram.com/p/...`',
    cmd_facebook: '📘 *Facebook Download*\n\nUsage: `.fb <facebook_url>`\n\nExample: `.fb https://facebook.com/watch/...`',
    cmd_pinterest: '📌 *Pinterest Search*\n\nUsage: `.pin <search_query>`\n\nExample: `.pin lamborghini wallpapers`',
    cmd_song: '🎵 *Song Download*\n\nUsage: `.song <song_name>`\n\nExample: `.song coldplay yellow`',
    cmd_video: '🎬 *Video Download*\n\nUsage: `.video <query>`\n\nExample: `.video funny cats`',
    cmd_lyrics: '📝 *Lyrics Finder*\n\nUsage: `.lyrics <song_name>`\n\nExample: `.lyrics aldebaran`',

    // Tools
    cmd_sticker: '🎨 *Sticker Maker*\n\nUsage: Send an image with `.sticker`',
    cmd_trt: '🌍 *Translator*\n\nUsage: `.trt <text>`\n\nTranslates to English automatically',
    cmd_calc: '🧮 *Calculator*\n\nUsage: `.calc 2+2*3`',
    cmd_weather: '🌤️ *Weather*\n\nUsage: `.weather <city>`\n\nExample: `.weather johannesburg`',
    cmd_tts: '🔊 *Text to Speech*\n\nUsage: `.tts <text>`',
    cmd_imagine: '🖼️ *AI Image Generator*\n\nUsage: `.imagine <prompt>`\n\nExample: `.imagine cyberpunk city at night`',

    // Fun
    cmd_meme: '😂 *Random Meme*\n\nUsage: `.meme`',
    cmd_joke: '🤣 *Random Joke*\n\nUsage: `.joke`',
    cmd_ship: '💕 *Ship Calculator*\n\nUsage: `.ship @user1 @user2`',
    cmd_flirt: '😏 *Flirty Line*\n\nUsage: `.flirt`',
    cmd_compliment: '🥰 *Random Compliment*\n\nUsage: `.compliment`',
    cmd_insult: '🔥 *Roast Generator*\n\nUsage: `.insult`',

    // Games
    cmd_ttt: '❌⭕ *Tic Tac Toe*\n\nUsage: `.ttt @opponent`',
    cmd_8ball: '🎱 *Magic 8-Ball*\n\nUsage: `.8ball Will I win?`',
    cmd_truth: '❓ *Truth Question*\n\nUsage: `.truth`',
    cmd_dare: '😈 *Dare Challenge*\n\nUsage: `.dare`',

    // Info
    cmd_menu: '📋 *Menu*\n\nType `.menu` to browse all commands',
    cmd_help: '❓ *Help*\n\nUsage: `.help <command>`\n\nExample: `.help tt`',
    cmd_ping: '🏓 *Ping*\n\nUsage: `.ping` — checks bot latency',
    cmd_status: '📊 *Status*\n\nUsage: `.status` — shows bot info'
  };

  const response = commands[selectedId] || 'Command not found. Send `.menu` to try again.';
  await sendText(to, response);
}

// ─── Handle Button Selections ───
async function handleButtonSelection(to, selectedId) {
  // Add button handlers here as needed
  console.log(`[BUTTON] Unhandled: ${selectedId}`);
}

// ─── Help Command ───
async function sendHelp(to, cmd) {
  await sendText(to, `Type *.menu* and select the category for "${cmd}" to see usage details.`);
}

// ─── Start Server ───
app.listen(PORT, () => {
  console.log(`[SERVER] KAMI Bot Cloud API running on port ${PORT}`);
  console.log(`[SERVER] Webhook: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}/webhook`);
});

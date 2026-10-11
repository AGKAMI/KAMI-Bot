/**
 * Shared SFW anime send — image + cross-launcher buttons.
 * Buttons all route through the generic again: dispatcher (target-less,
 * arg-free). NSFW anime commands must NEVER use this helper.
 */
const config = require('../config');
const { sendButtons } = require('./buttonHelper');

const EMOJI = { neko: '😺 Neko', waifu: ' Waifu', random: '🎴 Random', konachan: '🖼️ Konachan' };
const SFW = ['neko', 'waifu', 'random', 'konachan'];

function sfwRow(self) {
  const sibs = SFW.filter(c => c !== self);
  return [
    { id: `again:${self}`, text: '🔄 Another' },
    ...sibs.map(c => ({ id: `again:${c}`, text: EMOJI[c] })),
    { id: 'menu:anime', text: '⬅️ Anime menu' },
  ];
}

async function sendSfw(sock, from, quotedMsg, self, imageBuffer, caption) {
  return sendButtons(sock, from, {
    image: imageBuffer,
    text: caption,
    buttonText: '👇 More below',
    footer: config.botName || 'KAMI Bot',
    buttons: sfwRow(self),
  }, quotedMsg);
}

module.exports = { sfwRow, sendSfw };

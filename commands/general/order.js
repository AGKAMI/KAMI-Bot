/**
 * Make Order Command — interactive product catalog with CTA buttons.
 * Usage: .order
 *
 * Flow: Main menu → Category → Item → CTA URL (opens WhatsApp Business catalog)
 * All menus use nativeFlowMessage buttons.
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { sendButtons, onButton } = require('../../utils/buttonHelper');
const { pick, SLANG } = require('../../utils/format');
const { normalizeJidWithLid } = require('../../utils/jidHelper');

// Resolve DM JID from sender (redirects group clicks to DM)
function toDmJid(sender) {
  const resolved = normalizeJidWithLid(sender);
  const phone = resolved.split(':')[0].split('@')[0];
  return phone + '@s.whatsapp.net';
}

// ── Load catalog ────────────────────────────────────────────
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../../catalog.json'), 'utf8'));

// ── Category definitions ────────────────────────────────────
const CATEGORIES = [
  { id: 'flag',     label: '\u{1F1FF}\u{1F1E6}\u{1F697} Flag Cars',      emoji: '\u{1F1FF}\u{1F1E6}\u{1F697}' },
  { id: 'security', label: '\u{1F6E1}\u{FE0F} Security Cars',            emoji: '\u{1F6E1}\u{FE0F}' },
  { id: 'police',   label: '\u{1F6A8} Police Cars',                       emoji: '\u{1F6A8}' },
  { id: 'premium',  label: '\u{1F48E}\u{1F3CE}\u{FE0F} Premium Cars',    emoji: '\u{1F48E}\u{1F3CE}\u{FE0F}' },
  { id: 'mods',     label: '\u{1F527} Mods',                              emoji: '\u{1F527}' },
  { id: 'accounts', label: '\u{1F4B0} Accounts & Currency',               emoji: '\u{1F4B0}' },
];

// ── Mod sub-categories ──────────────────────────────────────
const MOD_SUBS = [
  { id: 'headlights', label: '\u{1F4A1} Glowing Headlights', items: [
    { key: 'headlights-red',    label: '\u{1F534} Red',    color: '\u{1F534}' },
    { key: 'headlights-blue',   label: '\u{1F535} Blue',   color: '\u{1F535}' },
    { key: 'headlights-green',  label: '\u{1F7E2} Green',  color: '\u{1F7E2}' },
    { key: 'headlights-yellow', label: '\u{1F7E1} Yellow', color: '\u{1F7E1}' },
    { key: 'headlights-purple', label: '\u{1F7E3} Purple', color: '\u{1F7E3}' },
    { key: 'headlights-orange', label: '\u{1F7E0} Orange', color: '\u{1F7E0}' },
    { key: 'headlights-cyan',   label: '\u{1F535}\u{FE0F} Cyan', color: '\u{1F535}\u{FE0F}' },
    { key: 'headlights-pink',   label: '\u{1F496} Pink',   color: '\u{1F496}' },
  ]},
  { id: 'callipers', label: '\u{1F534} Glowing Callipers', items: [
    { key: 'callipers-red',    label: '\u{1F534} Red',    color: '\u{1F534}' },
    { key: 'callipers-blue',   label: '\u{1F535} Blue',   color: '\u{1F535}' },
    { key: 'callipers-green',  label: '\u{1F7E2} Green',  color: '\u{1F7E2}' },
    { key: 'callipers-yellow', label: '\u{1F7E1} Yellow', color: '\u{1F7E1}' },
    { key: 'callipers-purple', label: '\u{1F7E3} Purple', color: '\u{1F7E3}' },
    { key: 'callipers-orange', label: '\u{1F7E0} Orange', color: '\u{1F7E0}' },
    { key: 'callipers-cyan',   label: '\u{1F535}\u{FE0F} Cyan', color: '\u{1F535}\u{FE0F}' },
  ]},
  { id: 'roofrack', label: '\u{1F4E6} Roof Rack', items: [
    { key: 'roof-rack', label: '\u{1F4E6} Roof Rack/Box', emoji: '\u{1F4E6}' },
  ]},
];

// ── Premium cars (paginated, 3 per page) ────────────────────
const PREMIUM_KEYS = Object.keys(catalog.premium);
const PREMIUM_PER_PAGE = 3;

// ── Helpers ──────────────────────────────────────────────────
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function getItem(itemId) {
  for (const cat of ['flags', 'security', 'police', 'premium', 'mods', 'accounts']) {
    if (catalog[cat]?.[itemId]) return catalog[cat][itemId];
  }
  return null;
}

function getCatalogLink(item) {
  if (item?.catalog) return item.catalog;
  return catalog.landingPage;
}

function hasImage(item) {
  if (!item?.image) return false;
  return fs.existsSync(path.join(__dirname, '../../', item.image));
}

// ── Menu builders ────────────────────────────────────────────

async function sendMainMenu(sock, chatId, quoted) {
  // Msg 1: first 3 categories
  await sendButtons(sock, chatId, {
    text: '\u{1F6D2} *MAKE ORDER*\n\nPick a category:',
    buttons: CATEGORIES.slice(0, 3).map(c => ({
      id: `order:cat:${c.id}`,
      text: c.label,
    })),
  }, quoted);

  await delay(600);

  // Msg 2: remaining 3 categories
  await sendButtons(sock, chatId, {
    text: 'More categories:',
    buttons: CATEGORIES.slice(3, 6).map(c => ({
      id: `order:cat:${c.id}`,
      text: c.label,
    })),
  }, quoted);
}

async function sendCategoryMenu(sock, chatId, catId, quoted) {
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat) return;

  const items = Object.entries(catalog[catId === 'flag' ? 'flags' : catId] || {});
  if (items.length === 0) {
    return sendButtons(sock, chatId, {
      text: `${cat.emoji} *${cat.label.toUpperCase()}*\n\n\u23F3 _Coming soon — no items yet_`,
      buttons: [{ id: 'order:main', text: '\u2B05\u{FE0F} Back' }],
    }, quoted);
  }

  // Send items in batches of 3, with back button in last batch (iPhone fix)
  for (let i = 0; i < items.length; i += 3) {
    const batch = items.slice(i, i + 3);
    const isLastBatch = i + 3 >= items.length;

    // In last batch, reserve 1 slot for back button
    const itemSlice = isLastBatch && batch.length === 3 ? batch.slice(0, 2) : batch;
    const buttons = itemSlice.map(([key, item]) => ({
      id: `order:item:${key}`,
      text: `\u{1F697} ${item.name} \u2014 ${item.price}`,
    }));

    // Add back button to last batch
    if (isLastBatch) {
      buttons.push({ id: 'order:main', text: '\u2B05\u{FE0F} Back to categories' });
    }

    const text = i === 0
      ? `${cat.emoji} *${cat.label.toUpperCase()}*\n\n_Pick an item:_`
      : `More items:`;

    await sendButtons(sock, chatId, { text, buttons }, quoted);
    if (i + 3 < items.length) await delay(600);
  }
}

async function sendModsMenu(sock, chatId, quoted) {
  for (let i = 0; i < MOD_SUBS.length; i++) {
    const sub = MOD_SUBS[i];

    // Batch items in groups of 3, reserve 1 slot for back button (iPhone fix)
    for (let j = 0; j < sub.items.length; j += 3) {
      const batch = sub.items.slice(j, j + 3);
      const isLastBatch = j + 3 >= sub.items.length;

      // In last batch, take only 2 items to leave room for back button
      const itemSlice = isLastBatch && batch.length === 3 ? batch.slice(0, 2) : batch;
      const buttons = itemSlice.map(item => ({
        id: `order:sub:${sub.id}:${item.key}`,
        text: item.label,
      }));

      // Add back button to last batch only
      if (isLastBatch) {
        buttons.push({ id: 'order:main', text: '\u2B05\u{FE0F} Back' });
      }

      const text = j === 0
        ? `*${sub.label}*\n_Pick a ${sub.id === 'roofrack' ? 'mod' : 'color'}:_`
        : `More ${sub.id === 'roofrack' ? 'mods' : 'colors'}:`;

      await sendButtons(sock, chatId, { text, buttons }, quoted);
      if (j + 3 < sub.items.length) await delay(600);
    }

    if (i < MOD_SUBS.length - 1) await delay(600);
  }
}

async function sendModColorMenu(sock, chatId, subId, quoted) {
  const sub = MOD_SUBS.find(s => s.id === subId);
  if (!sub) return;

  const items = sub.items;

  // Send items in batches of 3, back button in last batch (iPhone fix)
  for (let i = 0; i < items.length; i += 3) {
    const batch = items.slice(i, i + 3);
    const isLastBatch = i + 3 >= items.length;

    const itemSlice = isLastBatch && batch.length === 3 ? batch.slice(0, 2) : batch;
    const buttons = itemSlice.map(item => ({
      id: `order:item:${item.key}`,
      text: item.label,
    }));

    if (isLastBatch) {
      buttons.push({ id: 'order:main', text: '\u2B05\u{FE0F} Back to categories' });
    }

    const text = i === 0
      ? `*${sub.label}*\n_Pick a color:_`
      : `More colors:`;

    await sendButtons(sock, chatId, { text, buttons }, quoted);
    if (i + 3 < items.length) await delay(600);
  }
}

async function sendPremiumMenu(sock, chatId, page, quoted) {
  const start = page * PREMIUM_PER_PAGE;
  const batch = PREMIUM_KEYS.slice(start, start + PREMIUM_PER_PAGE);
  const totalPages = Math.ceil(PREMIUM_KEYS.length / PREMIUM_PER_PAGE);

  if (batch.length === 0) {
    return sendButtons(sock, chatId, {
      text: `\u{1F48E}\u{1F3CE}\u{FE0F} *PREMIUM CARS*\n\n_No more cars_`,
      buttons: [{ id: 'order:cat:premium:0', text: '\u{1F519} Start Over' }],
    }, quoted);
  }

  const buttons = batch.map(key => {
    const item = catalog.premium[key];
    return {
      id: `order:item:${key}`,
      text: `\u{1F3CE}\u{FE0F} ${item.name} \u2014 ${item.price}`,
    };
  });

  // Add back button to item batch (iPhone fix — back always renders)
  buttons.push({ id: 'order:main', text: '\u2B05\u{FE0F} Back' });

  const text = page === 0
    ? `\u{1F48E}\u{1F3CE}\u{FE0F} *PREMIUM CARS*\n\n_Page ${page + 1}/${totalPages}_`
    : `Page ${page + 1}/${totalPages}:`;

  // Send items + back button together
  await sendButtons(sock, chatId, { text, buttons }, quoted);

  // Send prev/next as separate message (may not render on iPhone — pagination trade-off)
  const navButtons = [];
  if (page > 0) navButtons.push({ id: `order:cat:premium:${page - 1}`, text: '\u{1F519} Prev' });
  if (start + PREMIUM_PER_PAGE < PREMIUM_KEYS.length) {
    navButtons.push({ id: `order:cat:premium:${page + 1}`, text: 'Next \u{1F51B}' });
  }
  if (navButtons.length > 0) {
    await delay(600);
    await sendButtons(sock, chatId, { text: '', buttons: navButtons }, quoted);
  }
}

async function sendItemDetail(sock, chatId, itemId, quoted) {
  const item = getItem(itemId);
  if (!item) {
    return sendButtons(sock, chatId, {
      text: '\u274C *ITEM NOT FOUND*\n\n_This item doesn\'t exist in the catalog_',
      buttons: [{ id: 'order:main', text: '\u2B05\u{FE0F} Back' }],
    }, quoted);
  }

  const catalogLink = getCatalogLink(item);
  const botName = config.botName.toUpperCase();

  // Find which category this item belongs to for back button
  let backCat = 'main';
  for (const catId of ['flags', 'security', 'police', 'premium', 'mods', 'accounts']) {
    if (catalog[catId]?.[itemId]) {
      backCat = catId === 'flags' ? 'flag' : catId;
      break;
    }
  }

  // Check if mod sub-category
  let backId = `order:cat:${backCat}`;
  if (backCat === 'mods') {
    // Find which mod sub
    for (const sub of MOD_SUBS) {
      if (sub.items.some(i => i.key === itemId)) {
        backId = `order:cat:mods`;
        break;
      }
    }
  }
  if (backCat === 'premium') {
    // Go to page 0
    backId = 'order:cat:premium:0';
  }

  const text =
    `\u{1F6D2} *ORDER*\n\n` +
    `\u{1F195} *${item.name}*\n\n` +
    `\u{1F4B0} *Price:* ${item.price}\n` +
    (item.desc ? `\u{1F4DD} *Details:* ${item.desc}\n` : '');

  const buttons = [
    { text: '\u{1F6D2} Order Now', url: catalogLink },
    { id: backId, text: '\u2B05\u{FE0F} Back' },
  ];

  // Send image + buttons (image gets details, button message gets instruction)
  const imgPath = item.image ? path.join(__dirname, '../../', item.image) : null;
  if (imgPath && fs.existsSync(imgPath)) {
    try {
      const imgBuffer = fs.readFileSync(imgPath);
      await sendButtons(sock, chatId, {
        text,
        buttonText: `\u{1F6CD}\u{FE0F} _Tap below to order from the catalog_`,
        buttons,
        image: imgBuffer,
      }, quoted);
    } catch (e) {
      await sendButtons(sock, chatId, { text, buttons }, quoted);
    }
  } else {
    await sendButtons(sock, chatId, { text, buttons }, quoted);
  }
}

// ── Button handlers ──────────────────────────────────────────
// All handlers redirect to DM if triggered from a group

// Main menu
onButton('order:main', async (sock, msg, from, sender, btnId) => {
  const target = from.endsWith('@g.us') ? toDmJid(sender) : from;
  await sendMainMenu(sock, target, msg);
});

// Category menus
onButton('order:cat:', async (sock, msg, from, sender, btnId) => {
  const target = from.endsWith('@g.us') ? toDmJid(sender) : from;
  const parts = btnId.split(':');
  const catId = parts[2];

  if (catId === 'premium') {
    const page = parseInt(parts[3]) || 0;
    await sendPremiumMenu(sock, target, page, msg);
  } else if (catId === 'mods') {
    await sendModsMenu(sock, target, msg);
  } else {
    await sendCategoryMenu(sock, target, catId, msg);
  }
});

// Mod sub-category menus
onButton('order:sub:', async (sock, msg, from, sender, btnId) => {
  const target = from.endsWith('@g.us') ? toDmJid(sender) : from;
  const parts = btnId.split(':');
  const subId = parts[2];
  await sendModColorMenu(sock, target, subId, msg);
});

// Item detail
onButton('order:item:', async (sock, msg, from, sender, btnId) => {
  const target = from.endsWith('@g.us') ? toDmJid(sender) : from;
  const itemId = btnId.replace('order:item:', '');
  await sendItemDetail(sock, target, itemId, msg);
});

// ── Command definition ───────────────────────────────────────
module.exports = {
  name: 'order',
  aliases: ['makeorder', 'shop', 'buy'],
  category: 'general',
  description: 'Browse and order CPM products',
  usage: '.order',
  sendMainMenu, // export for start.js to use

  async execute(sock, msg, args, extra) {
    try {
      const isGroup = extra.from.endsWith('@g.us');
      if (isGroup) {
        await sock.sendMessage(extra.from, {
          text: `\u{1F4AC} _check your DMs to browse the catalog._`,
        });
        const dmJid = toDmJid(extra.sender);
        // Unblock so DMs land (same as crew application)
        try { await sock.updateBlockStatus(dmJid, 'unblock'); } catch (e) {}
        await sendMainMenu(sock, dmJid, msg);
      } else {
        await sendMainMenu(sock, extra.from, msg);
      }
    } catch (error) {
      console.error('[ORDER] command error:', error);
      await extra.reply(`❌ _${pick(SLANG.error)} — couldn't load the catalog_`);
    }
  },
};

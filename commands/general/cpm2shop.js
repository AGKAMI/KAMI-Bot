/**
 * CPM2 Shop Window — live CPM2 catalogue from the VANTA GARAGE app.
 * Usage: .cpm2  (or the CPM2 button in .order)
 *
 * This command holds NO catalogue and NO images: everything is pulled from
 * the app's public products API on every request and images are sent BY URL
 * (WhatsApp fetches them itself). Payment never happens here — each car
 * hands the customer to the app (Telegram/browser) or to the owner.
 */

const config = require('../../config');
const { sendButtons } = require('../../utils/buttonHelper');
const { voice } = require('../../utils/format');

const API_BASE = (process.env.VANTA_API_URL || 'https://cpm2-bay.vercel.app/api/store').replace(/\/$/, '');
const WEB_BASE = (process.env.VANTA_WEB_URL || 'https://cpm2-bay.vercel.app').replace(/\/$/, '');
const OWNER_WA = process.env.OWNER_WA || 'https://wa.me/27683993925';
const PER_PAGE = 9;
const FETCH_TIMEOUT_MS = 15000;

// ── helpers ──────────────────────────────────────────────────

function formatCents(cents, currency = 'ZAR') {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(value);
}

async function fetchCpm2Catalogue() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}/products?game=cpm2`, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json();
    const products = Array.isArray(body?.products) ? body.products : [];
    return products;
  } finally {
    clearTimeout(timer);
  }
}

function stockLabel(p) {
  if (Number(p.stockQuantity) === 0) return '❌ Out of stock';
  if (p.exclusivity === 'one_of_one') return '💎 ONE OF ONE';
  if (p.exclusivity === 'limited_edition') return '⭐ Limited edition';
  if (p.availabilityState === 'limited') return '⏳ Limited stock';
  return '✅ In stock';
}

// ── menus ────────────────────────────────────────────────────

async function sendCpm2Menu(sock, chatId, page, quoted) {
  let products;
  try {
    products = await fetchCpm2Catalogue();
  } catch (err) {
    return sendButtons(sock, chatId, {
      text: `❌ *CAN'T REACH THE GARAGE*\n\n_Catalogue unavailable right now — ${voice.tag('err')}_\n\n_Try again in a moment._`,
      buttons: [
        { id: 'order:cpm2:0', text: '🔄 Try Again' },
        { id: 'order:main', text: '⬅️ Back' },
      ],
    }, quoted);
  }

  if (products.length === 0) {
    return sendButtons(sock, chatId, {
      text: `🏁 *CPM2 GARAGE*\n\n_No CPM2 builds live yet — check back soon._`,
      buttons: [
        { id: 'order:cpm1', text: '🇿🇦 Browse CPM1' },
        { id: 'order:main', text: '⬅️ Back' },
      ],
    }, quoted);
  }

  const totalPages = Math.ceil(products.length / PER_PAGE);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * PER_PAGE;
  const batch = products.slice(start, start + PER_PAGE);

  const buttons = batch.map((p) => ({
    id: `order:cpm2item:${p.id}`,
    text: `🏁 ${p.name} — ${formatCents(p.basePriceCents, p.currency)}`,
  }));

  // Nav buttons — Prev / Next / CPM1 / Back (max 10 rows fits)
  if (safePage > 0) buttons.push({ id: `order:cpm2:${safePage - 1}`, text: '⬅️ Prev' });
  if (start + PER_PAGE < products.length) buttons.push({ id: `order:cpm2:${safePage + 1}`, text: 'Next ➡️' });
  buttons.push({ id: 'order:cpm1', text: '🇿🇦 CPM1 Catalogue' });
  buttons.push({ id: 'order:main', text: '🏠 Main Menu' });

  await sendButtons(sock, chatId, {
    text: safePage === 0
      ? `🏁 *CPM2 GARAGE*\n\n_${products.length} live builds — pick one:_`
      : `🏁 *CPM2 GARAGE* — page ${safePage + 1}/${totalPages}:`,
    buttons,
  }, quoted);
}

async function sendCpm2Item(sock, chatId, productId, quoted) {
  let products;
  try {
    products = await fetchCpm2Catalogue();
  } catch (err) {
    return sendButtons(sock, chatId, {
      text: `❌ *CAN'T REACH THE GARAGE*\n\n_Try again in a moment._`,
      buttons: [{ id: 'order:cpm2:0', text: '⬅️ Back to CPM2' }],
    }, quoted);
  }

  const p = products.find((x) => String(x.id) === String(productId));
  if (!p) {
    return sendButtons(sock, chatId, {
      text: `❌ *BUILD NOT FOUND*\n\n_It may have sold or been unpublished._`,
      buttons: [{ id: 'order:cpm2:0', text: '⬅️ Back to CPM2' }],
    }, quoted);
  }

  const price = formatCents(p.basePriceCents, p.currency);
  const text =
    `🏁 *VANTA GARAGE — CPM2*\n\n` +
    `🚗 *${p.name}*\n\n` +
    `💰 *Price:* ${price}\n` +
    (p.starsPrice ? `⭐ *Stars:* ~${p.starsPrice}\n` : '') +
    `📦 *Stock:* ${stockLabel(p)}\n` +
    (p.description ? `\n📝 _${p.description}_\n` : '') +
    `\n_Ordering happens in the garage app — card, Instant EFT or Telegram Stars._`;

  const buttons = [
    { text: '🛒 Order It Yourself', url: `${WEB_BASE}/store/products/${p.id}` },
    { text: '💬 Chat To The Owner', url: OWNER_WA },
    { id: 'order:cpm2:0', text: '⬅️ Back to CPM2' },
  ];

  // Image BY URL — WhatsApp fetches it; nothing is ever written to bot disk.
  const image = p.coverUrl ? { url: p.coverUrl } : undefined;
  await sendButtons(sock, chatId, {
    text,
    buttonText: `👇 _Order ${p.name}:_`,
    buttons,
    image,
  }, quoted);
}

// ── command definition ───────────────────────────────────────
module.exports = {
  name: 'cpm2',
  reactions: { received: '🏁', done: '🏁' },
  aliases: ['shop2', 'garage'],
  category: 'general',
  description: 'Browse the live CPM2 catalogue from the VANTA GARAGE app',
  usage: '.cpm2',
  sendCpm2Menu, // exported for order.js's CPM2 button
  sendCpm2Item, // exported for order.js's CPM2 product rows

  async execute(sock, msg, args, extra) {
    try {
      const from = extra.from;
      const isGroup = from.endsWith('@g.us');
      const target = isGroup ? extra.sender.split(':')[0].split('@')[0] + '@s.whatsapp.net' : from;
      if (isGroup) {
        await sock.sendMessage(from, { text: `🏁 _check your DMs for the CPM2 garage._` }, { quoted: msg });
      }
      await sendCpm2Menu(sock, target, 0, msg);
    } catch (error) {
      console.error('[CPM2SHOP] command error:', error);
      extra.fail();
      await extra.reply(`❌ _${voice.openErr()} — couldn't load the CPM2 garage_`);
    }
  },
};
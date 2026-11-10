/**
 * VANTA GARAGE — WhatsApp storefront command for KAMI-Bot.
 *
 * Lives inside KAMI-Bot (Baileys bot), calls the VANTA GARAGE backend APIs
 * hosted on the CPM2 Next.js app (cpm2-bay.vercel.app). Zero bridge, zero
 * local port 3000 — pure HTTPS to the store backend.
 *
 * Flow:
 *   .vanta        → category menu (buttons)
 *   tap category  → product list (buttons)
 *   tap product   → product detail + Order button
 *   tap Order     → bot asks for Player ID + in-game name (text reply)
 *   send details  → order placed via VANTA API → order ID + status
 *   .status <id>  → check an order
 *
 * Sessions tracked in-memory (checkout state per sender). Survives a restart
 * only if the process stays up — acceptable for v1; DB-backed in Phase 6.
 */

const axios = require('axios');
const config = require('../../config');
const { bold, italic, mono, SEP, pick, SLANG, voice } = require('../../utils/format');

// VANTA GARAGE backend base URL — set via panel env var VANTA_API_URL, default to Vercel prod
const VANTA_BASE = process.env.VANTA_API_URL || 'https://cpm2-bay.vercel.app/api/store';

const api = axios.create({
  timeout: 20000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'KAMI-Bot/1.0 (VANTA GARAGE storefront)',
  },
});

// ── In-memory checkout sessions (sender number → state) ─────────────────────
// Key: WhatsApp sender number (digits, no @s.whatsapp.net)
const sessions = new Map();

function sessionKey(sender) {
  return String(sender || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

function getSession(sender) {
  return sessions.get(sessionKey(sender)) || null;
}

function setSession(sender, state) {
  const key = sessionKey(sender);
  if (state === null) sessions.delete(key);
  else sessions.set(key, state);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(cents, currency = 'ZAR') {
  const r = (cents / 100).toFixed(2);
  return `R${r.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

async function fetchCategories() {
  const r = await api.get(`${VANTA_BASE}/categories`);
  return r.data.categories || [];
}

async function fetchProducts({ categoryId, q } = {}) {
  const params = {};
  if (categoryId) params.category = categoryId;
  if (q) params.q = q;
  const r = await api.get(`${VANTA_BASE}/products`, { params });
  return r.data.products || [];
}

async function fetchProduct(id) {
  const r = await api.get(`${VANTA_BASE}/products/${encodeURIComponent(id)}`);
  return r.data.product;
}

async function fetchOrder(orderId) {
  const r = await api.get(`${VANTA_BASE}/orders/${encodeURIComponent(orderId)}`);
  return r.data.order;
}

async function placeOrder({ customerId, productId, quantity, paymentMethod, playerId, inGameName, idempotencyKey }) {
  const r = await api.post(`${VANTA_BASE}/checkout`, {
    customerId,
    productId,
    quantity: quantity || 1,
    paymentMethod,
    playerId,
    inGameName,
    idempotencyKey,
  });
  return r.data;
}

// ── Message builders (whatsapp-styling: *BOLD ALL CAPS* headers, SEP, mono) ─

function header(title) {
  return `${SEP}\n${bold(title.toUpperCase())}\n${SEP}`;
}

function categoryMenuMessage(categories) {
  const lines = [
    header('VANTA GARAGE'),
    '_CPM2 vehicles for sale — pick a category:_',
    '',
  ];
  for (const c of categories) {
    lines.push(`- ${c.name} — ${c.description || 'vehicles'}`);
  }
  lines.push('', '_Reply with the category name, or tap a button._');
  return lines.join('\n');
}

function productMenuMessage(category, products) {
  if (!products || products.length === 0) {
    return [
      header(`${category.toUpperCase()}`),
      '_No vehicles in this category yet._',
      '',
      'Reply `MENU` to start over.',
    ].join('\n');
  }
  const lines = [
    header(`${category.toUpperCase()}`),
    `_${products.length} vehicle${products.length === 1 ? '' : 's'} available:_`,
    '',
  ];
  for (const p of products.slice(0, 12)) {
    const excl = p.exclusivity && p.exclusivity !== 'standard' ? ` _(${p.exclusivity.replace(/_/g, ' ')})_` : '';
    const stock = p.stockQuantity === 0 ? '~SOLD OUT~' : `${p.stockQuantity} left`;
    lines.push(
      `#${p.id} ${p.name}${excl}`,
      `${formatMoney(p.basePriceCents, p.currency)} · ${stock}`,
      p.description ? `_${p.description}_` : '',
      '',
    );
  }
  lines.push('Reply `ORDER <id>` to buy (e.g. `ORDER 49`).');
  lines.push('Reply `MENU` to start over.');
  return lines.join('\n');
}

function productDetailMessage(p) {
  const excl = p.exclusivity && p.exclusivity !== 'standard' ? ` — ${p.exclusivity.replace(/_/g, ' ')}` : '';
  return [
    header(`VEHICLE #${p.id}`),
    `*${p.name}*${excl}`,
    `${formatMoney(p.basePriceCents, p.currency)}`,
    p.description ? `_${p.description}_` : '',
    '',
    `Stock: ${p.stockQuantity === 0 ? '~SOLD OUT~' : p.stockQuantity + ' left'}`,
    '',
    'Reply `ORDER <id>` to buy (e.g. `ORDER 49`).',
    'Reply `MENU` to start over.',
  ].join('\n');
}

function detailsRequestMessage(product, paymentMethod) {
  return [
    header(`ORDER #${product.id}`),
    `*${product.name}* — ${formatMoney(product.basePriceCents, product.currency)}`,
    '',
    'To place this order I need two things:',
    '',
    '1. Your *Player ID* (CPM2 player ID)',
    '2. Your *in-game name*',
    '',
    'Reply with both on one line, like:',
    mono('784123 Chief'),
    '',
    paymentMethod === 'payfast' ? 'Payment: *PayFast* (online — payment link after confirm)' : 'Payment: *EFT* (manual — upload proof after ordering)',
    '',
    '_Your order is reserved for 60 minutes once placed._',
  ].join('\n');
}

function confirmMessage(product, playerId, inGameName, paymentMethod) {
  return [
    header('CONFIRM ORDER'),
    `*${product.name}* — ${formatMoney(product.basePriceCents, product.currency)}`,
    '',
    `Player ID: ${mono(playerId)}`,
    `In-game name: ${inGameName}`,
    `Payment: ${paymentMethod === 'payfast' ? 'PayFast (online)' : 'EFT (manual proof)'}`,
    '',
    'Reply *YES* to place the order, or *NO* to cancel.',
    '',
    '_60-minute reservation starts once you confirm._',
  ].join('\n');
}

function orderPlacedMessage(orderId, reservedUntil) {
  return [
    header('ORDER PLACED ✅'),
    `Order *${orderId}* is reserved for 60 minutes.`,
    '',
    `Expires: ${new Date(reservedUntil).toLocaleString()}`,
    '',
    'Next steps:',
    '1. Pay via the method you selected.',
    '2. I\'ll confirm once payment clears.',
    '3. We\'ll arrange delivery appointment.',
    '',
    `Check status anytime: *STATUS ${orderId}*`,
    '',
    '_Sharp — your vehicle is on the way._',
  ].join('\n');
}

function orderStatusMessage(order) {
  return [
    header(`ORDER ${order.id}`),
    `*${order.inGameName}* — ${formatMoney(order.amountCents, order.currency)}`,
    '',
    `Order: ${order.orderState.replace(/_/g, ' ')}`,
    `Payment: ${order.paymentState.replace(/_/g, ' ')}`,
    `Delivery: ${order.deliveryState.replace(/_/g, ' ')}`,
    '',
    order.reservedUntil ? `Reserved until: ${new Date(order.reservedUntil).toLocaleString()}` : '',
  ].filter(Boolean).join('\n');
}

// ── Command definition ─────────────────────────────────────────────────────

module.exports = {
  name: 'vanta',
  aliases: ['garage', 'store'],
  category: 'general',
  description: 'VANTA GARAGE — browse and order CPM2 vehicles',
  usage: '.vanta',
  reactions: { received: '🛒', done: '🧾' },

  async execute(sock, msg, args, extra) {
    try {
      const sender = msg.key.participant || extra.from;
      const text = (args.join(' ') || '').trim();
      const upper = text.toUpperCase();

      // ── STATUS <id> ───────────────────────────────────────────────
      if (upper.startsWith('STATUS ')) {
        const orderId = text.slice('STATUS '.length).trim();
        if (!orderId) {
          return extra.reply('⚠️ _Give me an order ID. Example: .vanta STATUS VNT_abc123_');
        }
        try {
          const order = await fetchOrder(orderId);
          if (!order) {
            return extra.reply('❌ _Order not found. Check the ID and try again._');
          }
          return extra.reply(orderStatusMessage(order));
        } catch (e) {
          return extra.reply(`❌ _Couldn't fetch order: ${e.message}_`);
        }
      }

      // ── MENU / START / HELLO / HI ─────────────────────────────────
      if (upper === 'MENU' || upper === 'START' || upper === 'HI' || upper === 'HELLO' || text === '') {
        setSession(sender, null);
        const categories = await fetchCategories();
        if (!categories || categories.length === 0) {
          return extra.reply(
            `${header('VANTA GARAGE')}\n_Categories not loading right now. Try again in a mo._\n\nReply .vanta to retry.`
          );
        }
        return extra.reply(categoryMenuMessage(categories));
      }

      // ── HELP ──────────────────────────────────────────────────────
      if (upper === 'HELP') {
        return extra.reply(
          `${header('VANTA GARAGE')}\n` +
          '_CPM2 vehicles for real money. Commands:_\n\n' +
          '`.vanta` — open the store (categories)\n' +
          '`.vanta STATUS <id>` — check your order\n' +
          '`ORDER <id>` — start an order (then send Player ID + in-game name)\n' +
          '`YES` / `NO` — confirm or cancel a pending order\n' +
          '`MENU` — back to categories\n\n' +
          'Sharp, lekke.'
        );
      }

      // ── YES / NO (checkout confirmation) ──────────────────────────
      if (upper === 'YES' || upper === 'NO') {
        const session = getSession(sender);
        if (!session || session.step !== 'awaiting_confirm') {
          return extra.reply(
            `${header('NO ORDER PENDING')}\n_Start an order with .vanta ORDER <id>, then send your details._\n\nReply MENU to start over.`
          );
        }
        if (upper === 'NO') {
          setSession(sender, null);
          return extra.reply(
            `${header('ORDER CANCELLED')}\n_No problem. Reply .vanta to browse again._`
          );
        }
        // YES → place order
        try {
          const product = await fetchProduct(session.productId);
          if (!product || !product.isPublished || product.stockQuantity === 0) {
            setSession(sender, null);
            return extra.reply(
              `${header('NOT AVAILABLE')}\n_${product ? product.name : 'That vehicle'} is sold out or unpublished._\n\nReply .vanta to browse again.`
            );
          }
          const idempotencyKey = `wa_${sessionKey(sender)}_${session.productId}_${Date.now()}`;
          const result = await placeOrder({
            customerId: 0, // guest customer — created at checkout if needed
            productId: session.productId,
            quantity: 1,
            paymentMethod: session.paymentMethod || 'eft',
            playerId: session.playerId || '',
            inGameName: session.inGameName || '',
            idempotencyKey,
          });
          setSession(sender, null);
          return extra.reply(orderPlacedMessage(result.order.id, result.reservedUntil));
        } catch (e) {
          return extra.reply(`❌ _Order failed: ${e.message}_\n_Reply .vanta ORDER <id> to try again._`);
        }
      }

      // ── ORDER <id> ────────────────────────────────────────────────
      if (upper.startsWith('ORDER ')) {
        const id = Number(text.split(/\s+/)[1]);
        if (!Number.isFinite(id) || id <= 0) {
          return extra.reply('⚠️ _Use .vanta ORDER <id> — e.g. .vanta ORDER 49_');
        }
        try {
          const product = await fetchProduct(id);
          if (!product) {
            return extra.reply('❌ _Vehicle not found in the catalogue._\n_Reply .vanta to browse._');
          }
          if (!product.isPublished || product.stockQuantity === 0) {
            return extra.reply(`❌ _${product.name} is sold out or unpublished._\n_Reply .vanta to browse._`);
          }
          setSession(sender, {
            step: 'awaiting_details',
            productId: id,
            paymentMethod: 'eft',
          });
          return extra.reply(detailsRequestMessage(product, 'eft'));
        } catch (e) {
          return extra.reply(`❌ _Couldn't load vehicle: ${e.message}_`);
        }
      }

      // ── Text details input during checkout ────────────────────────
      const session = getSession(sender);
      if (session && session.step === 'awaiting_details') {
        const parts = text.split(/\s+/);
        if (parts.length < 2) {
          return extra.reply(
            'Please send both on one line:\n' +
            mono('784123 Chief') +
            '\n(Player ID then in-game name)'
          );
        }
        const [playerId, ...nameParts] = parts;
        session.playerId = playerId;
        session.inGameName = nameParts.join(' ');
        session.step = 'awaiting_confirm';
        setSession(sender, session);
        try {
          const product = await fetchProduct(session.productId);
          if (!product) {
            setSession(sender, null);
            return extra.reply('❌ _That vehicle is no longer available._\n_Reply .vanta to browse._');
          }
          return extra.reply(confirmMessage(product, session.playerId, session.inGameName, session.paymentMethod || 'eft'));
        } catch (e) {
          setSession(sender, null);
          return extra.reply(`❌ _Couldn't load vehicle: ${e.message}_`);
        }
      }

      // ── SEARCH <q> ────────────────────────────────────────────────
      if (upper.startsWith('SEARCH ')) {
        const q = text.slice('SEARCH '.length).trim();
        if (!q) {
          return extra.reply('⚠️ _Use .vanta SEARCH <name> — e.g. .vanta SEARCH supra_');
        }
        try {
          const products = await fetchProducts({ q });
          if (!products || products.length === 0) {
            return extra.reply(
              `${header(`SEARCH: ${q}`)}\n_No vehicles match that name._\n\nReply .vanta to browse categories.`
            );
          }
          return extra.reply(productMenuMessage(`Search: ${q}`, products));
        } catch (e) {
          return extra.reply(`❌ _Search failed: ${e.message}_`);
        }
      }

      // ── Unknown — fall back to menu ───────────────────────────────
      const categories = await fetchCategories();
      return extra.reply(categoryMenuMessage(categories));

    } catch (error) {
      console.error('[VANTA] command error:', error);
      extra.fail();
      return extra.reply(`❌ _${voice.openErr()} — store couldn't load. Try .vanta again._`);
    }
  },
};

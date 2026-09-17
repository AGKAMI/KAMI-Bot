/**
 * Image Text Overlay — renders text + circular avatar on images using sharp
 * Used for welcome/goodbye images
 */

const sharp = require('sharp');

/**
 * Default text style config
 */
const DEFAULT_STYLE = {
  lines: [],
  position: 'center',
  padding: 40,
  bg: { color: 'rgba(0,0,0,0.6)', radius: 16, padding: 24 },
  fontFamily: 'Arial, Helvetica, sans-serif',
  avatar: null,        // Buffer of user profile pic
  avatarSize: 120,     // Diameter in px
  avatarBorder: 4,     // Border width
  avatarBorderColor: '#ffffff',
};

/**
 * Create a circular avatar from a buffer
 */
async function createCircleAvatar(avatarBuffer, size, borderColor, borderWidth) {
  const half = borderWidth / 2;
  const outerSize = size + borderWidth * 2;

  // Create white circle border
  const borderSvg = Buffer.from(
    `<svg width="${outerSize}" height="${outerSize}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${outerSize / 2}" cy="${outerSize / 2}" r="${size / 2 + borderWidth}" fill="${borderColor}"/>
    </svg>`
  );

  // Resize avatar to circle
  const circleAvatar = await sharp(avatarBuffer)
    .resize(size, size, { fit: 'cover' })
    .composite([{
      input: Buffer.from(
        `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
        </svg>`
      ),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

  // Composite avatar onto border circle
  const result = await sharp(borderSvg)
    .composite([{
      input: circleAvatar,
      top: borderWidth,
      left: borderWidth,
    }])
    .png()
    .toBuffer();

  return result;
}

/**
 * Build the full composited image
 * @param {Buffer} bgBuffer - Background image
 * @param {object} style - Config
 * @returns {Promise<Buffer>} Final JPEG buffer
 */
async function buildImage(bgBuffer, style = {}) {
  const config = { ...DEFAULT_STYLE, ...style };
  const bg = sharp(bgBuffer);
  const meta = await bg.metadata();
  const w = meta.width;
  const h = meta.height;

  const composites = [];

  // 1. Add dark overlay for readability
  const overlaySvg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="rgba(0,0,0,0.35)"/>
    </svg>`
  );
  composites.push({ input: overlaySvg, top: 0, left: 0 });

  // 2. Add circular avatar if provided
  let avatarBottomY = 0;
  if (config.avatar) {
    try {
      const size = config.avatarSize || 120;
      const border = config.avatarBorder || 4;
      const circle = await createCircleAvatar(
        config.avatar, size, config.avatarBorderColor || '#ffffff', border
      );
      const avatarX = (w - size - border * 2) / 2;
      const avatarY = h / 2 - (size + border * 2) - 40;
      composites.push({ input: circle, top: Math.round(avatarY), left: Math.round(avatarX) });
      avatarBottomY = avatarY + size + border * 2 + 20;
    } catch (e) {
      console.error('Avatar overlay error:', e);
    }
  }

  // 3. Build text SVG
  const { lines, fontFamily, padding: pad } = { ...DEFAULT_STYLE, ...config };
  if (lines.length) {
    const lineHeight = 1.4;
    let totalH = 0;
    for (const l of lines) totalH += (l.size || 32) * lineHeight;

    const bgPad = config.bg?.padding || 24;
    const blockH = totalH + bgPad * 2;
    const blockW = w - (pad || 40) * 2;

    // Position below avatar if present, otherwise center
    let startY;
    if (config.avatar) {
      startY = avatarBottomY;
    } else if (config.position === 'top') {
      startY = pad || 40;
    } else if (config.position === 'bottom') {
      startY = h - blockH - (pad || 40);
    } else {
      startY = (h - blockH) / 2;
    }
    startY = Math.max(pad || 40, Math.min(startY, h - blockH - (pad || 40)));

    let svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;

    // Text background
    if (config.bg) {
      svg += `<rect x="${pad || 40}" y="${startY}" width="${blockW}" height="${blockH}" rx="${config.bg.radius || 0}" fill="${config.bg.color}"/>`;
    }

    // Text
    let y = startY + bgPad;
    for (const l of lines) {
      const size = l.size || 32;
      const color = l.color || '#ffffff';
      const weight = l.bold ? 'bold' : 'normal';
      const deco = l.italic ? 'italic' : 'normal';
      const escaped = (l.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      svg += `<text x="${w / 2}" y="${y + size}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" font-style="${deco}" fill="${color}" text-anchor="middle">${escaped}</text>`;
      y += size * lineHeight;
    }

    svg += '</svg>';
    composites.push({ input: Buffer.from(svg), top: 0, left: 0 });
  }

  // 4. Composite all layers
  const result = await bg
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  return result;
}

module.exports = { buildImage, createCircleAvatar };

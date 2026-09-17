/**
 * Image Text Overlay — renders text on images using sharp + SVG
 * Used for welcome/goodbye images
 */

const sharp = require('sharp');

/**
 * Default text style config
 */
const DEFAULT_STYLE = {
  // Text content
  lines: [],           // Array of { text, size, color, weight }
  
  // Position: 'top', 'center', 'bottom'
  position: 'center',
  
  // Padding from edges (px)
  padding: 40,
  
  // Background overlay
  bg: {
    color: 'rgba(0,0,0,0.6)',
    radius: 16,
    padding: 24,
  },
  
  // Font
  fontFamily: 'Arial, Helvetica, sans-serif',
};

/**
 * Build SVG text overlay
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {object} style - Style config
 * @returns {Buffer} SVG buffer
 */
function buildSvg(width, height, style) {
  const { lines, position, padding, bg, fontFamily } = { ...DEFAULT_STYLE, ...style };
  
  if (!lines.length) return null;
  
  // Calculate text block height
  const lineHeight = 1.4;
  let totalTextHeight = 0;
  for (const line of lines) {
    totalTextHeight += (line.size || 32) * lineHeight;
  }
  
  const bgPadding = bg?.padding || 24;
  const blockHeight = totalTextHeight + bgPadding * 2;
  const blockWidth = width - padding * 2;
  
  // Y position
  let startY;
  if (position === 'top') {
    startY = padding;
  } else if (position === 'bottom') {
    startY = height - blockHeight - padding;
  } else {
    startY = (height - blockHeight) / 2;
  }
  
  // Clamp
  startY = Math.max(padding, Math.min(startY, height - blockHeight - padding));
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Background box
  if (bg) {
    svg += `<rect x="${padding}" y="${startY}" width="${blockWidth}" height="${blockHeight}" rx="${bg.radius || 0}" fill="${bg.color}"/>`;
  }
  
  // Text lines
  let y = startY + bgPadding;
  for (const line of lines) {
    const size = line.size || 32;
    const color = line.color || '#ffffff';
    const weight = line.bold ? 'bold' : 'normal';
    const decoration = line.italic ? 'italic' : 'normal';
    
    // Escape XML
    const escaped = line.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    
    svg += `<text x="${width / 2}" y="${y + size}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" font-style="${decoration}" fill="${color}" text-anchor="middle">${escaped}</text>`;
    
    y += size * lineHeight;
  }
  
  svg += '</svg>';
  return Buffer.from(svg);
}

/**
 * Overlay text on an image
 * @param {Buffer} imageBuffer - Source image
 * @param {object} style - Style config (see DEFAULT_STYLE)
 * @returns {Promise<Buffer>} Composited image buffer
 */
async function overlayText(imageBuffer, style = {}) {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  
  const svg = buildSvg(metadata.width, metadata.height, style);
  if (!svg) return imageBuffer;
  
  const result = await image
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
  
  return result;
}

module.exports = { overlayText, buildSvg, DEFAULT_STYLE };

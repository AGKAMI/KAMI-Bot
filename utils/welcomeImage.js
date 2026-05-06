/**
 * Custom Welcome/Goodbye Image Generator
 * Creates images locally without external APIs
 */

const canvas = require('canvas');
const fs = require('fs');
const path = require('path');

const BG_IMAGE_URL = 'https://kommodo.ai/i/INjPkg5HGY7etpObdC7g';

// Download and cache background image
let cachedBgBuffer = null;

async function getBackgroundImage() {
  if (cachedBgBuffer) return cachedBgBuffer;
  
  try {
    const axios = require('axios');
    const response = await axios.get(BG_IMAGE_URL, { responseType: 'arraybuffer' });
    cachedBgBuffer = Buffer.from(response.data);
    return cachedBgBuffer;
  } catch (e) {
    // Return null if download fails, will use solid color
    return null;
  }
}

async function createWelcomeImage(options) {
  const {
    memberName,
    memberPic = null,
    groupName,
    groupPic = null,
    memberCount,
    creatorName,
    dateStr,
    groupDesc
  } = options;

  // Image dimensions (16:9 ratio) - 800x450
  const width = 800;
  const height = 450;

  // Create canvas
  const cvs = canvas.createCanvas(width, height);
  const ctx = cvs.getContext('2d');

  try {
    // Try to load background
    const bgBuffer = await getBackgroundImage();
    if (bgBuffer) {
      const bg = await canvas.loadImage(bgBuffer);
      ctx.drawImage(bg, 0, 0, width, height);
    } else {
      // Fallback: dark gradient background
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#16213e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  } catch (e) {
    // Fallback: dark background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Semi-transparent overlay for text readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(20, 20, width - 40, height - 40);

  // Draw avatar circle
  const avatarX = width / 2;
  const avatarY = 140;
  const avatarRadius = 60;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Try to draw member profile pic, fallback to group pic
  let picToDraw = memberPic;
  if (!picToDraw || picToDraw === '') {
    picToDraw = groupPic;
  }
  
  if (picToDraw && picToDraw.startsWith('http')) {
    try {
      const axios = require('axios');
      const picResponse = await axios.get(picToDraw, { responseType: 'arraybuffer' });
      const picBuffer = Buffer.from(picResponse.data);
      const userImg = await canvas.loadImage(picBuffer);
      ctx.drawImage(userImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    } catch (e) {
      // Draw default circle
      ctx.fillStyle = '#4a4a6a';
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#4a4a6a';
    ctx.fill();
  }
  ctx.restore();

  // Avatar border
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 5, 0, Math.PI * 2);
  ctx.stroke();

  // WELCOME text
  ctx.fillStyle = '#00d4ff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WELCOME', avatarX, 240);

  // Member name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(memberName || 'New Member', avatarX, 285);

  // Group name
  ctx.fillStyle = '#00d4ff';
  ctx.font = '20px sans-serif';
  ctx.fillText(`to ${creatorName}'s ${groupName} group`, avatarX, 320);

  // Date
  ctx.fillStyle = '#888888';
  ctx.font = '14px sans-serif';
  ctx.fillText(dateStr || 'Created today', avatarX, 350);

  // Member count badge
  const badgeX = width - 60;
  const badgeY = 40;
  
  ctx.fillStyle = '#00d4ff';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 25, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(memberCount.toString(), badgeX, badgeY + 5);

  return cvs.toBuffer('image/png');
}

async function createGoodbyeImage(options) {
  const {
    memberName,
    memberPic = null,
    groupName,
    groupPic = null,
    memberCount
  } = options;

  const width = 800;
  const height = 450;

  const cvs = canvas.createCanvas(width, height);
  const ctx = cvs.getContext('2d');

  try {
    const bgBuffer = await getBackgroundImage();
    if (bgBuffer) {
      const bg = await canvas.loadImage(bgBuffer);
      ctx.drawImage(bg, 0, 0, width, height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#16213e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  } catch (e) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(20, 20, width - 40, height - 40);

  const avatarX = width / 2;
  const avatarY = 150;
  const avatarRadius = 60;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let picToDraw = memberPic;
  if (!picToDraw || picToDraw === '') {
    picToDraw = groupPic;
  }
  
  if (picToDraw && picToDraw.startsWith('http')) {
    try {
      const axios = require('axios');
      const picResponse = await axios.get(picToDraw, { responseType: 'arraybuffer' });
      const picBuffer = Buffer.from(picResponse.data);
      const userImg = await canvas.loadImage(picBuffer);
      ctx.drawImage(userImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    } catch (e) {
      ctx.fillStyle = '#4a4a6a';
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#4a4a6a';
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ff6b6b';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GOODBYE', avatarX, 260);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`Bye ${memberName || 'Member'}!`, avatarX, 305);

  ctx.fillStyle = '#ff6b6b';
  ctx.font = '18px sans-serif';
  ctx.fillText(`Member count: ${memberCount}`, avatarX, 340);

  ctx.fillStyle = '#888888';
  ctx.font = '14px sans-serif';
  ctx.fillText('Catch ya when we do 👋', avatarX, 370);

  return cvs.toBuffer('image/png');
}

module.exports = {
  createWelcomeImage,
  createGoodbyeImage
};
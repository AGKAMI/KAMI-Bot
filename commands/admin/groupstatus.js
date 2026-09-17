const crypto = require('crypto');
const {
  generateWAMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');
const { PassThrough } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const { bold, italic, pick, SLANG } = require('../../utils/format');

// Single default color for text statuses (purple)
const PURPLE_COLOR = '#9C27B0';

module.exports = {
  name: 'groupstatus',
  aliases: ['togstatus', 'swgc', 'gs', 'gstatus'],
  description: 'Post replied media or text as a WhatsApp group status (new Group Status feature).',
  usage: '.groupstatus [caption]  (reply to image/video/audio) OR .groupstatus your text',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      const from = extra.from;

      // Only inside groups
      if (!extra.isGroup) {
        return extra.reply('❌ _moegoe, this only works in groups hey_');
      }

      const caption = (args.join(' ') || '').trim();

      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      const hasQuoted = !!ctxInfo?.quotedMessage;

      // CASE 1: No quoted message -> treat as TEXT group status
      if (!hasQuoted) {
        if (!caption) {
          return extra.reply(
            `${bold('group status usage')}\n\n` +
            `• Reply to image/video/audio with:\n` +
            `  \`.groupstatus [optional caption]\`\n` +
            `• Or send text status only:\n` +
            `  \`.groupstatus Your text here\`\n\n` +
            `Text statuses use a single purple background color by default.`
          );
        }

        await extra.reply('⏳ _posting status..._');

        try {
          await groupStatus(sock, from, {
            text: caption,
            backgroundColor: PURPLE_COLOR,
          });
          return extra.reply('✅ _lekke, status posted_');
        } catch (e) {
          console.error('groupstatus text error:', e);
          return extra.reply('❌ _moegoe, couldn\'t post status: ' + (e.message || e) + '_');
        }
      }

      // CASE 2: Quoted media -> image/video/audio group status
      const targetMessage = {
        key: {
          remoteJid: from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: ctxInfo.quotedMessage,
      };

      const mtype = Object.keys(targetMessage.message)[0] || '';

      const downloadBuf = async () => {
        const qmsg = targetMessage.message;
        if (/image/i.test(mtype))   return await downloadMedia(qmsg, 'image');
        if (/video/i.test(mtype))   return await downloadMedia(qmsg, 'video');
        if (/audio/i.test(mtype))   return await downloadMedia(qmsg, 'audio');
        if (/sticker/i.test(mtype)) return await downloadMedia(qmsg, 'sticker'); // download sticker correctly
        return null;
      };

      // IMAGE (also handles stickers)
      if (/image|sticker/i.test(mtype)) {
        await extra.reply('⏳ _posting image status..._');
        let buf;
        try {
          buf = await downloadBuf();
        } catch {
          return extra.reply('❌ _moegoe, couldn\'t download image_');
        }
        if (!buf) return extra.reply('❌ _moegoe, couldn\'t download image_');

        try {
          await groupStatus(sock, from, {
            image: buf,
            caption: caption || '',
          });
          return extra.reply('✅ _lekke, image status posted_');
        } catch (e) {
          console.error('groupstatus image error:', e);
          return extra.reply('❌ _moegoe, couldn\'t post image status: ' + (e.message || e) + '_');
        }
      }

      // VIDEO
      if (/video/i.test(mtype)) {
        await extra.reply('⏳ _posting video status..._');
        let buf;
        try {
          buf = await downloadBuf();
        } catch {
          return extra.reply('❌ _moegoe, couldn\'t download video_');
        }
        if (!buf) return extra.reply('❌ _moegoe, couldn\'t download video_');

        try {
          await groupStatus(sock, from, {
            video: buf,
            caption: caption || '',
          });
          return extra.reply('✅ _lekke, video status posted_');
        } catch (e) {
          console.error('groupstatus video error:', e);
          return extra.reply('❌ _moegoe, couldn\'t post video status: ' + (e.message || e) + '_');
        }
      }

      // AUDIO (voice-style group status)
      if (/audio/i.test(mtype)) {
        await extra.reply('⏳ _posting audio status..._');
        let buf;
        try {
          buf = await downloadBuf();
        } catch {
          return extra.reply('❌ _moegoe, couldn\'t download audio_');
        }
        if (!buf) return extra.reply('❌ _moegoe, couldn\'t download audio_');

        let vn;
        try {
          vn = await toVN(buf);
        } catch {
          vn = buf;
        }

        let waveform;
        try {
          waveform = await generateWaveform(buf);
        } catch {
          waveform = undefined;
        }

        try {
          await groupStatus(sock, from, {
            audio: vn,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            waveform,
          });
          return extra.reply('✅ _lekke, audio status posted_');
        } catch (e) {
          console.error('groupstatus audio error:', e);
          return extra.reply('❌ _moegoe, couldn\'t post audio status: ' + (e.message || e) + '_');
        }
      }
    } catch (e) {
      console.error('groupstatus error:', e);
      return extra.reply('❌ _moegoe, ' + (e.message || e) + '_');
    }
  }
};

// ---- Helpers ----

async function downloadMedia(msg, type) {
  const mediaMsg = msg[`${type}Message`] || msg;
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function groupStatus(sock, jid, content) {
  const { backgroundColor } = content;
  delete content.backgroundColor;

  const inside = await generateWAMessageContent(content, {
    upload: sock.waUploadToServer,
    backgroundColor: backgroundColor || PURPLE_COLOR,
  });

  const secret = crypto.randomBytes(32);

  const msg = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { messageSecret: secret },
      groupStatusMessageV2: {
        message: {
          ...inside,
          messageContextInfo: { messageSecret: secret },
        },
      },
    },
    {}
  );

  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
  return msg;
}

function toVN(buffer) {
  return new Promise((resolve, reject) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks = [];

    input.end(buffer);

    ffmpeg(input)
      .noVideo()
      .audioCodec('libopus')
      .format('ogg')
      .audioChannels(1)
      .audioFrequency(48000)
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)))
      .pipe(output);

    output.on('data', (c) => chunks.push(c));
  });
}

function generateWaveform(buffer, bars = 64) {
  return new Promise((resolve, reject) => {
    const input = new PassThrough();
    input.end(buffer);

    const chunks = [];

    ffmpeg(input)
      .audioChannels(1)
      .audioFrequency(16000)
      .format('s16le')
      .on('error', reject)
      .on('end', () => {
        const raw = Buffer.concat(chunks);
        const samples = raw.length / 2;
        const amps = [];

        for (let i = 0; i < samples; i++) {
          amps.push(Math.abs(raw.readInt16LE(i * 2)) / 32768);
        }

        const size = Math.floor(amps.length / bars);
        if (size === 0) return resolve(undefined);

        const avg = Array.from({ length: bars }, (_, i) =>
          amps
            .slice(i * size, (i + 1) * size)
            .reduce((a, b) => a + b, 0) / size
        );

        const max = Math.max(...avg);
        if (max === 0) return resolve(undefined);

        resolve(
          Buffer.from(
            avg.map((v) => Math.floor((v / max) * 100))
          ).toString('base64')
        );
      })
      .pipe()
      .on('data', (c) => chunks.push(c));
  });
}
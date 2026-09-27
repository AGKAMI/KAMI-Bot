/**
 * TTS - Text to Speech Command
 */

const APIs = require('../../utils/api');
const config = require('../../config');
const axios = require('axios');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'tts',
  reactions: { received: '🗣️', generating: '🔊', done: '🎧' },
  aliases: ['speak', 'say'],
  category: 'general',
  description: 'Turn text into speech with TTS-Nova',
  usage: '.tts <text>',
  
  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const chatId = extra.from;
      const text = args.join(' ');

      if (!text) {
        return extra.reply(`⚠️ *WARNING*\n💡 Give me text to turn into speech\n📝 *Example:* *${prefix}tts hi how are you*`);
      }

      const result = await APIs.textToSpeech(text);

      // APIs.textToSpeech resolves to a Buffer OR a URL — handle both
      let audioBuffer;
      if (Buffer.isBuffer(result)) {
        audioBuffer = result;
      } else {
        const audioResponse = await axios.get(result, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        audioBuffer = Buffer.from(audioResponse.data);
      }

      if (!audioBuffer || audioBuffer.length < 300) throw new Error('empty audio returned');

      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype: 'audio/mp3',
        ptt: true // Play as voice message
      }, { quoted: msg });

    } catch (error) {
      console.error('TTS command error:', error);
      extra.fail();
      await extra.reply(`❌ *ERROR*\n💡 ${voice.openErr()} — couldn't make the speech: ${error.message}`);
    }
  }
};



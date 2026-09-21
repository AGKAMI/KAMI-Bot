/**
 * Weather Command - Get weather information using OpenWeather API
 */

const axios = require('axios');
const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'weather',
  aliases: ['w', 'clima'],
  category: 'utility',
  description: 'Get weather for a city',
  usage: '.weather <city>',
  
  async execute(sock, msg, args) {
    const prefix = config.prefix || '.';
    try {
      if (args.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: `📝 _${pick(SLANG.vibe)}, give me a city name_\n\n_Example:_ ${prefix}weather london`
        }, { quoted: msg });
      }
      
      const city = args.join(' ');
      const apiKey = '4902c0f2550f58298ad4146a92b65e10';
      
      const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
      const weather = response.data;
      
      const weatherText = `Weather in ${weather.name}: ${weather.weather[0].description}. Temperature: ${weather.main.temp}°C.`;
      
      await sock.sendMessage(msg.key.remoteJid, { text: weatherText }, { quoted: msg });
      
    } catch (error) {
      console.error('Error fetching weather:', error);
      await sock.sendMessage(msg.key.remoteJid, { 
        text: `❌ _${pick(SLANG.error)}, couldn't get the weather right now_`
      }, { quoted: msg });
    }
  }
};

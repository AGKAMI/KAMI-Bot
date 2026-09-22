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
  
  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      if (args.length === 0) {
        return await extra.reply(`\u{1F4DD} _${pick(SLANG.vibe)}, give me a city name_\n\n_Example:_ ${prefix}weather london`);
      }
      
      const city = args.join(' ');
      const apiKey = '4902c0f2550f58298ad4146a92b65e10';
      
      const sent = await extra.reply(`\u{1F324}\uFE0F _fetching weather for ${city}..._`);
      
      const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
      const weather = response.data;
      
      const weatherText = `Weather in ${weather.name}: ${weather.weather[0].description}. Temperature: ${weather.main.temp}\u00B0C.`;
      
      await extra.edit(sent.key, weatherText);
      
    } catch (error) {
      console.error('Error fetching weather:', error);
      await extra.reply(`\u274C _${pick(SLANG.error)}, couldn't get the weather right now_`);
    }
  }
};

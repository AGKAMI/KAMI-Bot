/**
 * Weather Command - Get weather information
 */

const APIs = require('../../utils/api');
const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
  name: 'weather',
  reactions: { received: '🌤️', generating: '🌦️', done: '🌡️' },
  aliases: ['w', 'clima'],
  category: 'utility',
  description: 'Get the weather for a city',
  usage: '.weather <city>',
  
  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    try {
      if (args.length === 0) {
        return await extra.reply(`\u{1F4DD} _${voice.lead('neutral')}, give me a city name_\n\n_Example:_ ${prefix}weather london`);
      }
      
      const city = args.join(' ');
      const sent = await extra.reply(`\u{1F324}\uFE0F _fetching weather for ${city}..._`);
      
      const weather = await APIs.getWeather(city);
      
      let text;
      if (weather.text) {
        text = weather.text;
      } else {
        text = `🌤️ *Weather in ${weather.city}*\n\n` +
               `🌡️ *Temp:* ${weather.temp}°C (feels like ${weather.feelsLike}°C)\n` +
               `💧 *Humidity:* ${weather.humidity}%\n` +
               `💨 *Wind:* ${weather.wind} km/h\n` +
               `📝 *Condition:* ${weather.desc}`;
      }
      
      await extra.edit(sent.key, text);
      
    } catch (error) {
      extra.fail();
      await extra.reply(`\u274C _${voice.openErr()}, couldn't get the weather right now_`);
    }
  }
};

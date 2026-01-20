// test-bot.js
const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  host: '192.168.12.77',
  port: 25565,
  username: 'IslandBot',
  version: '1.21.8'
})

bot.once('spawn', () => {
  console.log('Bot spawned')
  bot.chat('Hello, I am a bot.')
})

bot.on('error', console.log)
bot.on('kicked', console.log)

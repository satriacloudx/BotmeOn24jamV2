const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

let isClientReady = false;
let qrCodeData = null;
let botStatus = 'Starting...';
let clientInitialized = false;
let lastQRTime = null;
let messageCount = 0;
let lastMessageTime = null;
let connectionStartTime = new Date();

function logWithTime(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function initializeClient() {
    if (clientInitialized) return;

    logWithTime('🚀 Initializing WhatsApp Client...');

    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './wa_auth',
            clientId: 'wa-bot-' + Date.now()
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        }
    });

    client.on('qr', (qr) => {
        qrCodeData = qr;
        lastQRTime = new Date();
        botStatus = 'QR Code Ready - Please Scan';
        logWithTime('📱 QR CODE GENERATED!');
        qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
        logWithTime('✅ WhatsApp Authentication Successful');
        botStatus = 'Authenticated - Starting...';
        qrCodeData = null;
    });

    client.on('ready', async () => {
        logWithTime('🎉 WHATSAPP BOT IS READY!');
        isClientReady = true;
        qrCodeData = null;
        botStatus = 'Online - Reading Messages';

        try {
            const info = client.info;
            logWithTime(`📱 Connected as: ${info.pushname || 'Unknown'} (${info.wid.user})`);
        } catch (error) {
            logWithTime('⚠️ Warning getting bot info: ' + error.message);
        }
    });

    client.on('auth_failure', (msg) => {
        logWithTime('❌ Authentication Failed: ' + msg);
        botStatus = 'Auth Failed - Retrying...';
        qrCodeData = null;
        setTimeout(() => {
            client.destroy().then(() => {
                clientInitialized = false;
                setTimeout(initializeClient, 5000);
            });
        }, 10000);
    });

    client.on('disconnected', (reason) => {
        logWithTime('⚠️ WhatsApp Disconnected: ' + reason);
        isClientReady = false;
        botStatus = 'Disconnected: ' + reason;
        setTimeout(() => {
            client.destroy().then(() => {
                clientInitialized = false;
                setTimeout(initializeClient, 5000);
            });
        }, 15000);
    });

    client.on('message', async (message) => {
        try {
            if (message.fromMe) return;
            messageCount++;
            lastMessageTime = new Date();
            const contact = await message.getContact();
            const chat = await message.getChat();
            logWithTime(`📨 New message from ${contact.number} in ${chat.name || 'Private Chat'}: ${message.body?.substring(0, 100)}`);
            try {
                await chat.sendSeen();
            } catch (_) {}
        } catch (error) {
            logWithTime('❌ Error processing message: ' + error.message);
        }
    });

    client.initialize();
    clientInitialized = true;
    botStatus = 'Initializing...';
    return client;
}

const client = initializeClient();

// 🔧 API-only routes

app.get('/', (req, res) => {
    res.json({
        response: {
            status: "true",
            message: "Bot Successfully Activated!",
            author: "SATRIADEV"
        }
    });
});

app.get('/health', (req, res) => {
    const uptimeSeconds = process.uptime();
    res.json({
        status: 'healthy',
        bot_status: botStatus,
        bot_ready: isClientReady,
        has_qr: !!qrCodeData,
        uptime_seconds: uptimeSeconds,
        messages_processed: messageCount,
        last_message: lastMessageTime,
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    logWithTime(`🚀 Server running on port ${PORT}`);
});

setInterval(() => {
    logWithTime(`💓 Heartbeat - Status: ${botStatus}`);
}, 300000); // 5 minutes

process.on('SIGINT', async () => {
    logWithTime('🛑 Shutting down gracefully...');
    try {
        if (client) await client.destroy();
    } catch (_) {}
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logWithTime('🛑 Received SIGTERM, shutting down...');
    try {
        if (client) await client.destroy();
    } catch (_) {}
    process.exit(0);
});

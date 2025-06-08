const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Variables untuk status bot
let isClientReady = false;
let qrCodeData = null;
let botStatus = 'Initializing...';

// Inisialisasi WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './wa_auth'
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
            '--disable-gpu'
        ]
    }
});

// Event handlers untuk WhatsApp Client
client.on('qr', (qr) => {
    console.log('='.repeat(50));
    console.log('QR CODE RECEIVED - SCAN WITH WHATSAPP');
    console.log('='.repeat(50));
    qrCodeData = qr;
    botStatus = 'QR Code generated - Please scan';
    
    // Tampilkan QR di terminal dengan error handling
    try {
        qrcode.generate(qr, { small: true });
        console.log('QR Code displayed above ↑');
    } catch (error) {
        console.error('Error generating QR in terminal:', error);
        console.log('QR Code data:', qr);
        console.log('Please check the web dashboard for QR code');
    }
    
    console.log('='.repeat(50));
    console.log('Open WhatsApp → Settings → Linked Devices → Link Device');
    console.log('Or visit your web dashboard to see QR code');
    console.log('='.repeat(50));
});

client.on('ready', () => {
    console.log('='.repeat(50));
    console.log('✅ WHATSAPP BOT IS READY AND ONLINE!');
    console.log('='.repeat(50));
    isClientReady = true;
    qrCodeData = null;
    botStatus = 'Online and ready';
    console.log('Bot is now reading all messages...');
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated successfully');
    botStatus = 'Authenticated';
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    botStatus = 'Authentication failed';
    qrCodeData = null; // Reset QR untuk generate ulang
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    isClientReady = false;
    botStatus = 'Disconnected: ' + reason;
});

// Event untuk membaca pesan (hanya log, tidak membalas)
client.on('message', async (message) => {
    try {
        const contact = await message.getContact();
        const chat = await message.getChat();
        
        // Log informasi pesan
        console.log(`[${new Date().toLocaleString()}] Message received:`);
        console.log(`From: ${contact.name || contact.pushname || contact.number}`);
        console.log(`Chat: ${chat.name || 'Private'}`);
        console.log(`Message: ${message.body}`);
        console.log(`Type: ${message.type}`);
        console.log('---');
        
        // Tandai pesan sebagai sudah dibaca
        if (message.fromMe === false) {
            await chat.sendSeen();
        }
        
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Event untuk notifikasi grup
client.on('group_join', (notification) => {
    console.log(`[${new Date().toLocaleString()}] Someone joined a group`);
});

client.on('group_leave', (notification) => {
    console.log(`[${new Date().toLocaleString()}] Someone left a group`);
});

// Routes untuk web interface
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Bot Status</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .status { padding: 15px; border-radius: 5px; margin: 20px 0; }
                .online { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .offline { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .qr-section { text-align: center; margin: 20px 0; }
                #qrcode { margin: 20px 0; }
                button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
                button:hover { background: #0056b3; }
                .info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 WhatsApp Bot Status</h1>
                <div class="status ${isClientReady ? 'online' : 'offline'}">
                    <strong>Status:</strong> ${botStatus}
                </div>
                
                <div class="info">
                    <h3>📋 Bot Information:</h3>
                    <ul>
                        <li><strong>Function:</strong> Read messages only (no replies)</li>
                        <li><strong>Uptime:</strong> 24/7 online</li>
                        <li><strong>Auto-read:</strong> Marks messages as seen</li>
                        <li><strong>Logging:</strong> Console logs all messages</li>
                    </ul>
                </div>
                
                ${qrCodeData ? `
                    <div class="qr-section">
                        <h3>📱 Scan QR Code to Login:</h3>
                        <div id="qrcode"></div>
                        <p>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
                    </div>
                ` : ''}
                
                <button onclick="window.location.reload()">🔄 Refresh Status</button>
            </div>
            
            ${qrCodeData ? `
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
                <script>
                    const qr = new QRious({
                        element: document.getElementById('qrcode'),
                        value: '${qrCodeData}',
                        size: 256
                    });
                </script>
            ` : ''}
        </body>
        </html>
    `);
});

// API endpoint untuk status
app.get('/api/status', (req, res) => {
    res.json({
        isReady: isClientReady,
        status: botStatus,
        hasQR: !!qrCodeData,
        timestamp: new Date().toISOString()
    });
});

// API endpoint untuk QR code
app.get('/api/qr', (req, res) => {
    if (qrCodeData) {
        res.json({ qr: qrCodeData });
    } else {
        res.json({ qr: null });
    }
});

// Health check endpoint untuk Render
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
});

// Initialize WhatsApp client
console.log('🚀 Initializing WhatsApp Bot...');
console.log('📱 Waiting for QR Code or authentication...');
console.log('💡 Check web dashboard if QR code doesn\'t appear here');
client.initialize();

// Keep-alive ping untuk mencegah sleep
setInterval(() => {
    console.log(`[${new Date().toLocaleString()}] Bot is alive - Status: ${botStatus}`);
}, 300000); // Setiap 5 menit

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await client.destroy();
    process.exit(0);
});

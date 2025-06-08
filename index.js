const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
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
let botStatus = 'Starting...';
let clientInitialized = false;
let lastQRTime = null;
let messageCount = 0;
let lastMessageTime = null;
let connectionStartTime = new Date();

// Fungsi untuk log dengan timestamp
function logWithTime(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

// Inisialisasi WhatsApp Client dengan retry mechanism
function initializeClient() {
    if (clientInitialized) {
        logWithTime('⚠️ Client already initialized, skipping...');
        return;
    }

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

    // Event: QR Code Generated
    client.on('qr', (qr) => {
        qrCodeData = qr;
        lastQRTime = new Date();
        botStatus = 'QR Code Ready - Please Scan';
        
        logWithTime('📱 QR CODE GENERATED!');
        console.log('='.repeat(60));
        console.log('🔗 QR CODE DATA RECEIVED');
        console.log('📊 QR Length:', qr.length);
        console.log('⏰ Generated at:', lastQRTime.toLocaleString());
        console.log('🌐 Web Dashboard: Check your app URL for QR code');
        console.log('📱 Direct QR: /qr-image endpoint');
        console.log('='.repeat(60));
        
        // Try to display in terminal
        try {
            qrcode.generate(qr, { small: true });
            logWithTime('✅ QR displayed in terminal');
        } catch (error) {
            logWithTime('⚠️ Terminal QR failed: ' + error.message);
            logWithTime('📱 Use web dashboard instead');
        }
        
        // Log raw QR data (for debugging)
        logWithTime('Raw QR data: ' + qr.substring(0, 50) + '...');
    });

    // Event: Authentication Success
    client.on('authenticated', () => {
        logWithTime('✅ WhatsApp Authentication Successful');
        botStatus = 'Authenticated - Starting...';
        qrCodeData = null;
    });

    // Event: Client Ready
    client.on('ready', async () => {
        logWithTime('🎉 WHATSAPP BOT IS READY!');
        isClientReady = true;
        qrCodeData = null;
        botStatus = 'Online - Reading Messages';
        console.log('='.repeat(60));
        console.log('✅ BOT STATUS: ONLINE AND READY');
        console.log('📖 MODE: Read Only (No Replies)');
        console.log('👁️ AUTO-READ: Enabled');
        console.log('='.repeat(60));
        
        // Test koneksi dan info bot
        try {
            const info = client.info;
            logWithTime(`📱 Connected as: ${info.pushname || 'Unknown'}`);
            logWithTime(`📞 Phone: ${info.wid.user}`);
            logWithTime(`🔋 Battery: ${info.battery}%`);
            logWithTime(`📶 Connected: ${info.connected ? 'Yes' : 'No'}`);
            
            // Get all chats untuk test
            const chats = await client.getChats();
            logWithTime(`💬 Total Chats: ${chats.length}`);
            logWithTime('✅ All systems ready - Bot will now read all messages');
            
        } catch (error) {
            logWithTime('⚠️ Warning getting bot info: ' + error.message);
        }
    });

    // Event: Authentication Failed
    client.on('auth_failure', (msg) => {
        logWithTime('❌ Authentication Failed: ' + msg);
        botStatus = 'Auth Failed - Retrying...';
        qrCodeData = null;
        
        // Retry after 10 seconds
        setTimeout(() => {
            logWithTime('🔄 Retrying authentication...');
            client.destroy().then(() => {
                clientInitialized = false;
                setTimeout(initializeClient, 5000);
            });
        }, 10000);
    });

    // Event: Disconnected
    client.on('disconnected', (reason) => {
        logWithTime('⚠️ WhatsApp Disconnected: ' + reason);
        isClientReady = false;
        botStatus = 'Disconnected: ' + reason;
        
        // Auto-reconnect
        setTimeout(() => {
            logWithTime('🔄 Attempting to reconnect...');
            client.destroy().then(() => {
                clientInitialized = false;
                setTimeout(initializeClient, 5000);
            });
        }, 15000);
    });

    // Event: Message Received (Improved)
    client.on('message', async (message) => {
        try {
            // Skip jika pesan dari bot sendiri
            if (message.fromMe) {
                return;
            }
            
            // Update counters
            messageCount++;
            lastMessageTime = new Date();
            
            logWithTime('📨 NEW MESSAGE RECEIVED:');
            
            // Get contact info
            const contact = await message.getContact();
            const chat = await message.getChat();
            
            // Detailed logging
            console.log('   📱 From:', contact.name || contact.pushname || contact.number);
            console.log('   💬 Chat:', chat.name || (chat.isGroup ? 'Group Chat' : 'Private Chat'));
            console.log('   🔤 Type:', message.type);
            console.log('   📄 Message:', message.body ? message.body.substring(0, 200) : '[No text content]');
            console.log('   ⏰ Time:', new Date(message.timestamp * 1000).toLocaleString());
            console.log('   📍 Chat ID:', chat.id._serialized);
            
            // Handle different message types
            if (message.hasMedia) {
                const media = await message.downloadMedia();
                console.log('   📎 Media:', media.mimetype, '- Size:', media.data.length, 'bytes');
            }
            
            if (message.hasQuotedMsg) {
                const quotedMsg = await message.getQuotedMessage();
                console.log('   💭 Quoted:', quotedMsg.body ? quotedMsg.body.substring(0, 50) : '[Media]');
            }
            
            // Mark as read dengan retry
            try {
                await chat.sendSeen();
                console.log('   ✅ Message marked as READ');
            } catch (readError) {
                console.log('   ⚠️ Failed to mark as read:', readError.message);
                // Retry setelah 1 detik
                setTimeout(async () => {
                    try {
                        await chat.sendSeen();
                        console.log('   ✅ Message marked as READ (retry)');
                    } catch (retryError) {
                        console.log('   ❌ Failed to mark as read (retry):', retryError.message);
                    }
                }, 1000);
            }
            
            console.log('   ' + '-'.repeat(50));
            
        } catch (error) {
            logWithTime('❌ Error processing message: ' + error.message);
            console.log('   Error details:', error);
        }
    });

    // Event: Loading Screen
    client.on('loading_screen', (percent, message) => {
        logWithTime(`📱 Loading WhatsApp: ${percent}% - ${message}`);
        botStatus = `Loading: ${percent}% - ${message}`;
    });

    // Event: Message Create (semua pesan termasuk yang dikirim bot)
    client.on('message_create', async (message) => {
        try {
            if (message.fromMe) {
                logWithTime('📤 Outgoing message detected (from this device)');
                return;
            }
            // Log singkat untuk message_create
            logWithTime('📥 Message created event triggered');
        } catch (error) {
            logWithTime('❌ Error in message_create: ' + error.message);
        }
    });

    // Event: Group Join
    client.on('group_join', async (notification) => {
        try {
            logWithTime('👥 GROUP JOIN EVENT');
            console.log('   📱 Group:', notification.chatId);
            console.log('   👤 Participants:', notification.recipientIds.length);
            console.log('   ⏰ Time:', new Date().toLocaleString());
        } catch (error) {
            logWithTime('❌ Error in group_join: ' + error.message);
        }
    });

    // Event: Group Leave
    client.on('group_leave', async (notification) => {
        try {
            logWithTime('👥 GROUP LEAVE EVENT');
            console.log('   📱 Group:', notification.chatId);
            console.log('   👤 Participants:', notification.recipientIds.length);
            console.log('   ⏰ Time:', new Date().toLocaleString());
        } catch (error) {
            logWithTime('❌ Error in group_leave: ' + error.message);
        }
    });

    // Event: Contact Changed
    client.on('contact_changed', async (message, oldId, newId, isContact) => {
        try {
            logWithTime('📞 CONTACT CHANGED EVENT');
            console.log('   🔄 Contact updated:', oldId, '->', newId);
        } catch (error) {
            logWithTime('❌ Error in contact_changed: ' + error.message);
        }
    });

    // Event: Group Update
    client.on('group_update', async (notification) => {
        try {
            logWithTime('👥 GROUP UPDATE EVENT');
            console.log('   📱 Group:', notification.chatId);
            console.log('   🔄 Type:', notification.type);
            console.log('   ⏰ Time:', new Date().toLocaleString());
        } catch (error) {
            logWithTime('❌ Error in group_update: ' + error.message);
        }
    });

    // Event: Media Uploaded
    client.on('media_uploaded', (message) => {
        logWithTime('📎 MEDIA UPLOADED: ' + message.type);
    });

    // Event: Change State
    client.on('change_state', (state) => {
        logWithTime('🔄 WhatsApp State Changed: ' + state);
        if (state === 'CONNECTED') {
            botStatus = 'Connected and Active';
        } else if (state === 'OPENING') {
            botStatus = 'Opening Connection...';
        } else if (state === 'PAIRING') {
            botStatus = 'Pairing Device...';
        }
    });

    // Initialize client
    try {
        client.initialize();
        clientInitialized = true;
        logWithTime('✅ Client initialization started');
        botStatus = 'Initializing...';
    } catch (error) {
        logWithTime('❌ Failed to initialize client: ' + error.message);
        botStatus = 'Initialization Failed';
        
        // Retry initialization
        setTimeout(() => {
            clientInitialized = false;
            initializeClient();
        }, 10000);
    }

    return client;
}

// Start client initialization
const client = initializeClient();

// Routes untuk web interface
app.get('/', (req, res) => {
    const uptime = Math.floor(process.uptime());
    const uptimeStr = `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m ${uptime%60}s`;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Bot 24/7 Reader</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta http-equiv="refresh" content="10">
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    margin: 0; padding: 20px; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                }
                .container { 
                    max-width: 800px; margin: 0 auto; 
                    background: white; padding: 30px; 
                    border-radius: 15px; 
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                .header { text-align: center; margin-bottom: 30px; }
                .status { 
                    padding: 20px; border-radius: 10px; margin: 20px 0; 
                    font-size: 18px; font-weight: bold; text-align: center;
                }
                .online { background: #d4edda; color: #155724; border: 2px solid #c3e6cb; }
                .waiting { background: #fff3cd; color: #856404; border: 2px solid #ffeaa7; }
                .offline { background: #f8d7da; color: #721c24; border: 2px solid #f5c6cb; }
                .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
                .info-card { background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #007bff; }
                .info-card h3 { margin: 0 0 10px 0; color: #495057; }
                .qr-section { 
                    text-align: center; 
                    background: #e3f2fd; 
                    padding: 30px; 
                    border-radius: 10px; 
                    margin: 20px 0;
                    border: 2px dashed #2196f3;
                }
                .qr-section h2 { color: #1976d2; margin-bottom: 20px; }
                .btn { 
                    display: inline-block;
                    background: #007bff; color: white; 
                    padding: 12px 24px; margin: 10px 5px;
                    border: none; border-radius: 8px; 
                    text-decoration: none; font-size: 16px;
                    cursor: pointer; transition: all 0.3s;
                }
                .btn:hover { background: #0056b3; transform: translateY(-2px); }
                .btn-success { background: #28a745; }
                .btn-success:hover { background: #1e7e34; }
                .stats { display: flex; justify-content: space-around; text-align: center; margin: 20px 0; }
                .stat { background: #f8f9fa; padding: 15px; border-radius: 8px; flex: 1; margin: 0 5px; }
                .emoji { font-size: 24px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🤖 WhatsApp Bot Reader</h1>
                    <p>24/7 Message Reading Bot</p>
                </div>
                
                <div class="status ${isClientReady ? 'online' : (qrCodeData ? 'waiting' : 'offline')}">
                    <div class="emoji">${isClientReady ? '✅' : (qrCodeData ? '📱' : '⏳')}</div>
                    <div>${botStatus}</div>
                    ${lastQRTime ? `<small>Last QR: ${lastQRTime.toLocaleString()}</small>` : ''}
                </div>
                
                <div class="stats">
                    <div class="stat">
                        <div class="emoji">⏰</div>
                        <div><strong>Uptime</strong></div>
                        <div>${uptimeStr}</div>
                    </div>
                    <div class="stat">
                        <div class="emoji">📨</div>
                        <div><strong>Messages</strong></div>
                        <div>${messageCount}</div>
                    </div>
                    <div class="stat">
                        <div class="emoji">⏰</div>
                        <div><strong>Last Message</strong></div>
                        <div>${lastMessageTime ? lastMessageTime.toLocaleTimeString() : 'None'}</div>
                    </div>
                    <div class="stat">
                        <div class="emoji">🔄</div>
                        <div><strong>Auto Refresh</strong></div>
                        <div>10s</div>
                    </div>
                </div>
                
                ${qrCodeData ? `
                    <div class="qr-section">
                        <h2>📱 Scan QR Code to Connect</h2>
                        <p style="font-size: 16px; margin: 15px 0;">
                            Open WhatsApp → Settings → Linked Devices → Link a Device
                        </p>
                        <a href="/qr-image" class="btn btn-success" target="_blank">
                            📱 View QR Code
                        </a>
                        <p style="font-size: 14px; color: #666; margin-top: 15px;">
                            QR Code will refresh automatically every 10 seconds
                        </p>
                    </div>
                ` : ''}
                
                <div class="info-grid">
                    <div class="info-card">
                        <h3>🔍 Bot Function</h3>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>Read all incoming messages</li>
                            <li>Auto-mark messages as seen</li>
                            <li>Log messages to console</li>
                            <li>No auto-replies sent</li>
                        </ul>
                    </div>
                    
                    <div class="info-card">
                        <h3>⚡ Features</h3>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>24/7 online presence</li>
                            <li>Auto-reconnect on disconnect</li>
                            <li>Real-time status monitoring</li>
                            <li>Web-based QR scanning</li>
                        </ul>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="/health" class="btn">📊 Health Check</a>
                    <button onclick="window.location.reload()" class="btn">🔄 Refresh Status</button>
                    ${qrCodeData ? '<a href="/qr-image" class="btn btn-success">📱 Open QR Code</a>' : ''}
                </div>
            </div>
        </body>
        </html>
    `);
});

// QR Code image endpoint
app.get('/qr-image', async (req, res) => {
    if (qrCodeData) {
        try {
            const qrImage = await QRCode.toDataURL(qrCodeData, {
                width: 400,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WhatsApp QR Code</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta http-equiv="refresh" content="30">
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            padding: 20px; 
                            background: #f0f2f5;
                        }
                        .qr-container { 
                            background: white; 
                            padding: 30px; 
                            border-radius: 15px; 
                            display: inline-block; 
                            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                        }
                        .qr-code { 
                            max-width: 100%; 
                            height: auto; 
                            border: 1px solid #ddd; 
                            border-radius: 10px;
                        }
                        .instructions { 
                            margin: 20px 0; 
                            font-size: 16px; 
                            color: #333;
                        }
                        .btn { 
                            background: #25d366; 
                            color: white; 
                            padding: 12px 24px; 
                            border: none; 
                            border-radius: 8px; 
                            font-size: 16px; 
                            margin: 10px; 
                            cursor: pointer;
                            text-decoration: none;
                            display: inline-block;
                        }
                    </style>
                </head>
                <body>
                    <div class="qr-container">
                        <h2>📱 Scan with WhatsApp</h2>
                        <img src="${qrImage}" alt="WhatsApp QR Code" class="qr-code">
                        <div class="instructions">
                            <strong>How to scan:</strong><br>
                            1. Open WhatsApp on your phone<br>
                            2. Go to Settings → Linked Devices<br>
                            3. Tap "Link a Device"<br>
                            4. Scan this QR code
                        </div>
                        <a href="/" class="btn">← Back to Dashboard</a>
                        <button onclick="window.location.reload()" class="btn">🔄 Refresh QR</button>
                    </div>
                    <p style="color: #666; margin-top: 20px;">
                        Auto-refresh in 30 seconds • Generated: ${new Date().toLocaleString()}
                    </p>
                </body>
                </html>
            `);
        } catch (error) {
            logWithTime('❌ Error generating QR image: ' + error.message);
            res.status(500).send(`
                <html><body style="text-align:center; padding:50px;">
                    <h2>❌ Error generating QR Code</h2>
                    <p>Error: ${error.message}</p>
                    <a href="/">← Back to Dashboard</a>
                </body></html>
            `);
        }
    } else {
        res.send(`
            <html><body style="text-align:center; padding:50px;">
                <h2>⏳ No QR Code Available</h2>
                <p>Bot is starting or already connected</p>
                <p>Status: ${botStatus}</p>
                <a href="/">← Back to Dashboard</a>
                <script>setTimeout(() => window.location.reload(), 5000);</script>
            </body></html>
        `);
    }
});

// API endpoints
app.get('/api/status', (req, res) => {
    res.json({
        isReady: isClientReady,
        status: botStatus,
        hasQR: !!qrCodeData,
        qrGenerated: lastQRTime,
        uptime: process.uptime(),
        messagesProcessed: messageCount,
        lastMessage: lastMessageTime,
        timestamp: new Date().toISOString()
    });
});

// Test endpoint untuk cek apakah bot bisa akses WhatsApp
app.get('/api/test', async (req, res) => {
    if (!isClientReady || !client) {
        return res.json({
            success: false,
            message: 'Bot not ready',
            status: botStatus
        });
    }
    
    try {
        const info = client.info;
        const state = await client.getState();
        const chats = await client.getChats();
        
        res.json({
            success: true,
            message: 'Bot is working correctly',
            data: {
                connected_as: info.pushname || 'Unknown',
                phone: info.wid?.user || 'Unknown',
                battery: info.battery || 'Unknown',
                state: state,
                total_chats: chats.length,
                platform: info.platform || 'Unknown'
            }
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'Error testing bot functionality',
            error: error.message
        });
    }
});

app.get('/api/qr', (req, res) => {
    res.json({
        qr: qrCodeData,
        generated: lastQRTime,
        available: !!qrCodeData
    });
});

// Health check dengan detail
app.get('/health', (req, res) => {
    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    res.json({
        status: 'healthy',
        bot_status: botStatus,
        bot_ready: isClientReady,
        has_qr: !!qrCodeData,
        uptime_seconds: uptimeSeconds,
        uptime_formatted: `${uptimeHours}h ${uptimeMinutes}m`,
        messages_processed: messageCount,
        last_message: lastMessageTime,
        connection_start: connectionStartTime,
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    logWithTime(`🚀 Server started on port ${PORT}`);
    logWithTime(`📊 Dashboard: http://localhost:${PORT}`);
    logWithTime(`📱 QR Code: http://localhost:${PORT}/qr-image`);
});

// Keep-alive mechanism dengan monitoring
setInterval(() => {
    const uptimeHours = Math.floor(process.uptime() / 3600);
    logWithTime(`💓 Heartbeat - Status: ${botStatus}`);
    console.log(`   📊 Ready: ${isClientReady} | QR: ${!!qrCodeData} | Messages: ${messageCount}`);
    console.log(`   ⏰ Uptime: ${uptimeHours}h | Last Message: ${lastMessageTime ? lastMessageTime.toLocaleTimeString() : 'None'}`);
    
    // Test koneksi jika ready
    if (isClientReady && client) {
        client.getState().then(state => {
            console.log(`   📱 WhatsApp State: ${state}`);
        }).catch(err => {
            logWithTime(`⚠️ Warning - Failed to get state: ${err.message}`);
        });
    }
}, 300000); // Every 5 minutes

// Graceful shutdown
process.on('SIGINT', async () => {
    logWithTime('🛑 Shutting down gracefully...');
    try {
        if (client) {
            await client.destroy();
        }
    } catch (error) {
        logWithTime('❌ Error during shutdown: ' + error.message);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logWithTime('🛑 Received SIGTERM, shutting down...');
    try {
        if (client) {
            await client.destroy();
        }
    } catch (error) {
        logWithTime('❌ Error during shutdown: ' + error.message);
    }
    process.exit(0);
});

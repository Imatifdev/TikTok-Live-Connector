const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Create WebSocket server
const wss = new WebSocket.Server({ port: 3001 });

app.get('/', (req, res) => {
    res.send('TikTok Live Connector Server Running');
});

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    let tiktokConnection = null;
    let wentLive = false;
    let isMonitoring = true; // Monitor live status for 5 minutes

    ws.on('message', (message) => {
        const tiktokUsername = message.toString();
        console.log(`Starting TikTok Live connection for: ${tiktokUsername}`);
        const startTime = new Date();

        // Function to connect to TikTok live
        const connectToTikTokLive = () => {
            tiktokConnection = new WebcastPushConnection(tiktokUsername);

            tiktokConnection
                .connect()
                .then(() => {
                    console.log(`Connected to ${tiktokUsername}'s live at ${startTime}`);
                    ws.send(
                        JSON.stringify({
                            type: 'start_time',
                            data: new Date().toISOString(), // ISO 8601 format
                        })
                    );

                    wentLive = true;

                    // Listen for live events
                    tiktokConnection.on('chat', (data) => {
                        ws.send(JSON.stringify({ type: 'chat', data }));
                    });

                    tiktokConnection.on('like', (data) => {
                        ws.send(JSON.stringify({ type: 'like', data }));
                    });

                    tiktokConnection.on('gift', (data) => {
                        ws.send(JSON.stringify({ type: 'gift', data }));
                    });
                })
                .catch((err) => {
                    console.error('Failed to connect:', err);
                    ws.send(JSON.stringify({ error: 'Failed to connect to TikTok live' }));
                });
        };

        connectToTikTokLive();

        // Monitor live status for 5 minutes
        const monitorInterval = setInterval(() => {
            if (!wentLive) {
                console.log(`${tiktokUsername} has not gone live yet.`);
                ws.send(JSON.stringify({ type: 'status', message: `${tiktokUsername} has not gone live yet.` }));
            }
        }, 30000); // Send status every 30 seconds

        setTimeout(() => {
            isMonitoring = false; // Stop monitoring after 5 minutes
            clearInterval(monitorInterval);

            if (!wentLive) {
                ws.send(JSON.stringify({ type: 'not_live', message: `${tiktokUsername} did not go live within 5 minutes.` }));
                console.log(`${tiktokUsername} did not go live within 5 minutes.`);
            }
        }, 5 * 60 * 1000);

        // Handle when TikTok live ends
        tiktokConnection.on('disconnected', () => {
            console.log(`TikTok live for ${tiktokUsername} has ended`);
            const endTime = new Date();
            const duration = (endTime - startTime) / 1000; // Duration in seconds

            ws.send(
                JSON.stringify({
                    type: 'end_time',
                    data: {
                        startTime: startTime.toISOString(),
                        endTime: endTime.toISOString(),
                        duration: duration,
                    },
                })
            );

            // Clean up the connection
            if (tiktokConnection) {
                tiktokConnection.disconnect();
                tiktokConnection = null;
            }
        });

        // Reconnect on error or unexpected disconnection
        tiktokConnection.on('error', (err) => {
            console.error(`Error with TikTok live connection: ${err}`);
            if (isMonitoring) {
                console.log('Reconnecting...');
                connectToTikTokLive(); // Retry connection
            }
        });
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed.');
        isMonitoring = false;

        if (tiktokConnection) {
            tiktokConnection.disconnect();
        }
    });
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});

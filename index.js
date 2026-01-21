/**
 * Z.AI Image API Server - OpenAI Compatible
 * 
 * Provides OpenAI-compatible endpoints:
 * - POST /v1/images/generations
 * - GET /v1/models
 * 
 * Also provides native Z.AI endpoints:
 * - POST /generate
 * - GET /images
 * 
 * Environment Variables:
 * - Z_IMAGE_SESSION: Session token from image.z.ai (Required)
 * - Z_CHAT_TOKEN: Chat token for session refresh (Optional)
 * - API_KEY: Optional API key for authentication (Default: sk-key)
 * - PORT: Server port (default: 3000)
 */

import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ZImage from './z-image.js';
import { startBot, sendImageToAdmin } from './bot.js';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'sk-key';

app.use(express.json());

// Serve generated images statically
app.use('/generated', express.static(path.join(process.cwd(), 'generated')));

// API key authentication
const authenticate = (req, res, next) => {
    // If API_KEY is set in env, enforce it
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: { message: 'Missing API key', type: 'invalid_request_error' } });
    }

    const token = authHeader.slice(7);
    if (token !== API_KEY) {
        return res.status(401).json({ error: { message: 'Invalid API key', type: 'invalid_request_error' } });
    }

    next();
};

// Map OpenAI model names to Z.AI config
// z-image-pro -> Z.AI High Quality (mapped to 2K resolution)
// z-image -> Z.AI Standard (mapped to 1K resolution)
const modelMapping = {
    'z-image-pro': { resolution: '2K', quality: 'hd' },
    'z-image': { resolution: '1K', quality: 'standard' },
    'dall-e-3': { resolution: '2K', quality: 'hd' }, // Keep for compatibility if desired, or remove
    'dall-e-2': { resolution: '1K', quality: 'standard' }
};

// Map OpenAI size to Z.AI ratio
const sizeToRatio = {
    '256x256': '1:1',
    '512x512': '1:1',
    '1024x1024': '1:1',
    '1024x1792': '9:16',
    '1792x1024': '16:9',
    '1280x720': '16:9',
    '720x1280': '9:16',
    '1920x1080': '16:9',
    '1080x1920': '9:16'
};

// Map string quality to resolution
const qualityToResolution = {
    'standard': '1K',
    'hd': '2K',
    'low': '1K',
    'high': '2K'
};

// ===== Health & Info =====

app.get('/health', async (req, res) => {
    const sessionInfo = ZImage.getSessionInfo();
    res.json({
        status: sessionInfo.valid ? 'ok' : 'degraded',
        service: 'z-ai-image-api',
        session: sessionInfo,
        timestamp: new Date().toISOString()
    });
});

// ===== OpenAI Compatible Endpoints =====

// GET /v1/models
app.get('/v1/models', authenticate, (req, res) => {
    res.json({
        object: 'list',
        data: [
            {
                id: 'z-image',
                object: 'model',
                created: Date.now(),
                owned_by: 'z-ai',
                permission: [],
                root: 'z-image',
                parent: null
            },
            {
                id: 'z-image-pro',
                object: 'model',
                created: Date.now(),
                owned_by: 'z-ai',
                permission: [],
                root: 'z-image-pro',
                parent: null
            }
        ]
    });
});

// POST /v1/images/generations - OpenAI compatible
app.post('/v1/images/generations', authenticate, async (req, res) => {
    const requestStartTime = Date.now();
    console.log(`[REQUEST] New image generation request at ${new Date().toISOString()}`);
    
    try {
        const {
            prompt,
            model = 'z-ai-image',
            n = 1,
            size = '1024x1024',
            quality = 'standard',
            response_format = 'url',
            style = 'vivid'
        } = req.body;

        console.log(`[REQUEST] Model: ${model}, Size: ${size}, Format: ${response_format}`);

        if (!prompt) {
            return res.status(400).json({
                error: { message: 'Prompt is required', type: 'invalid_request_error' }
            });
        }

        // Map OpenAI params to Z.AI params
        const ratio = sizeToRatio[size] || '1:1';

        let resolution = '1K';
        if (modelMapping[model]) {
            resolution = modelMapping[model].resolution;
        } else if (model.includes('hd') || quality === 'hd' || quality === 'high') {
            resolution = '2K';
        } else if (qualityToResolution[quality]) {
            resolution = qualityToResolution[quality];
        }

        console.log(`[REQUEST] Mapped to Resolution: ${resolution}, Ratio: ${ratio}`);

        // Generate images (Z.AI generates one at a time)
        const results = [];
        for (let i = 0; i < Math.min(n, 4); i++) {
            const genStartTime = Date.now();
            const result = await ZImage.generate(prompt, {
                ratio,
                resolution,
                noWatermark: true
            });
            console.log(`[TIMING] Generation took ${Date.now() - genStartTime}ms`);

            // Helper to find image URL recursively in any structure
            const findImageUrl = (obj) => {
                if (!obj) return null;
                if (typeof obj === 'string') {
                    if (obj.match(/^https?:\/\/.*\.(png|jpg|jpeg|webp)/i) || obj.includes('/z_image/')) {
                        return obj;
                    }
                    return null;
                }
                if (typeof obj === 'object') {
                    // Check common keys first
                    if (obj.url && typeof obj.url === 'string' && (obj.url.startsWith('http') || obj.url.startsWith('/'))) return obj.url;
                    if (obj.image_url) return obj.image_url;

                    for (const key in obj) {
                        const found = findImageUrl(obj[key]);
                        if (found) return found;
                    }
                }
                return null;
            };

            // Extract image URL from response
            let imageUrl = findImageUrl(result);

            console.log(`[DEBUG] Extracted Image URL: ${imageUrl ? 'Yes, found: ' + imageUrl.slice(0, 30) + '...' : 'No'}`);

            if (imageUrl) {
                // User requested flow: server downloads -> converts to base64 -> sends to client
                // This ensures "broken image" icons don't appear in OpenWebUI
                console.log(`[GENERATE] Downloading image for Data URI conversion... ${imageUrl.slice(0, 30)}...`);

                try {
                    const downloadStartTime = Date.now();
                    const b64 = await ZImage.downloadAsBase64(imageUrl);
                    console.log(`[TIMING] Download took ${Date.now() - downloadStartTime}ms`);

                    // --- STORAGE LOGIC (Synchronous) ---
                    // We need to save the file BEFORE returning the response so the URL works
                    const generatedDir = path.join(process.cwd(), 'generated');
                    if (!fs.existsSync(generatedDir)) {
                        fs.mkdirSync(generatedDir);
                    }

                    // Convert to buffer
                    const imgBuffer = Buffer.from(b64, 'base64');
                    // Create safe filename
                    const safePrompt = prompt.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
                    const timestamp = Date.now();
                    const filename = `${timestamp}_${safePrompt}.png`;
                    const filePath = path.join(generatedDir, filename);

                    // Save file immediately
                    fs.writeFileSync(filePath, imgBuffer);
                    console.log(`[STORAGE] Saved: ${filename}`);

                    // Clean up old files
                    const files = fs.readdirSync(generatedDir);
                    const imageFiles = files
                        .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
                        .map(f => ({ name: f, time: fs.statSync(path.join(generatedDir, f)).mtime.getTime() }))
                        .sort((a, b) => b.time - a.time); // Newest first

                    if (imageFiles.length > 10) {
                        const toDelete = imageFiles.slice(10);
                        toDelete.forEach(f => {
                            fs.unlinkSync(path.join(generatedDir, f.name));
                        });
                    }

                    // --- ASYNC BACKGROUND TASKS (Forwarding) ---
                    setImmediate(() => {
                        try {
                            // Forward to Telegram
                            sendImageToAdmin(imgBuffer, `🎨 *New Generation*`, prompt);
                        } catch (bgError) {
                            console.error(`[BACKGROUND] Task failed: ${bgError.message}`);
                        }
                    });

                    // --- RESPONSE CONSTRUCTION ---
                    if (response_format === 'b64_json') {
                        results.push({
                            b64_json: b64,
                            revised_prompt: prompt
                        });
                    } else {
                        // Return LOCAL URL
                        // Construct absolute URL based on incoming request
                        const protocol = req.protocol;
                        const host = req.get('host'); // e.g., localhost:3001 or my-app.render.com
                        const localUrl = `${protocol}://${host}/generated/${filename}`;

                        console.log(`[RESPONSE] Returning Local URL: ${localUrl}`);

                        results.push({
                            url: localUrl,
                            revised_prompt: prompt
                        });
                    }
                } catch (err) {
                    console.error(`[GENERATE] Failed to convert image: ${err.message}`);
                    // Fallback to proxy URL if download fails?
                    // Use local proxy URL to avoid Forbidden errors in browser
                    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                    const host = process.env.PUBLIC_URL
                        ? process.env.PUBLIC_URL.replace(/^https?:\/\//, '')
                        : (req.headers['x-forwarded-host'] || req.get('host'));

                    const baseUrl = `${protocol}://${host}`;
                    const proxyUrl = `${baseUrl}/proxy/image?url=${encodeURIComponent(imageUrl)}`;

                    results.push({
                        url: proxyUrl,
                        revised_prompt: prompt
                    });
                }
            }
        }

        const totalTime = Date.now() - requestStartTime;
        console.log(`[RESPONSE] Sending response after ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);

        res.json({
            created: Math.floor(Date.now() / 1000),
            data: results
        });

    } catch (error) {
        const totalTime = Date.now() - requestStartTime;
        console.error(`[ERROR] Request failed after ${totalTime}ms:`, error.message);
        
        // Check if response was already sent
        if (!res.headersSent) {
            res.status(500).json({
                error: {
                    message: error.message,
                    type: 'server_error',
                    details: error.response?.data
                }
            });
        } else {
            console.error('[ERROR] Response already sent, cannot send error response');
        }
    }
});

// ===== Native Z.AI Endpoints =====

app.get('/options', (req, res) => {
    res.json({
        ratios: ZImage.ratios,
        resolutions: ZImage.resolutions,
        sizeMapping: sizeToRatio
    });
});

app.get('/session', (req, res) => {
    res.json(ZImage.getSessionInfo());
});

app.post('/session', async (req, res) => {
    try {
        const { token, chatToken } = req.body;

        if (token) {
            const info = await ZImage.setSession(token);
            res.json({ success: true, session: info });
        } else if (chatToken) {
            await ZImage.setChatToken(chatToken);
            res.json({ success: true, message: 'Chat token set for refresh' });
        } else {
            res.status(400).json({ success: false, error: 'Token is required' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/session/refresh', async (req, res) => {
    try {
        const success = await ZImage.refreshSession();
        if (success) {
            res.json({ success: true, session: ZImage.getSessionInfo() });
        } else {
            res.status(500).json({ success: false, error: 'Refresh failed - need valid chat token' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/generate', authenticate, async (req, res) => {
    try {
        const { prompt, ratio, resolution, noWatermark } = req.body;

        if (!prompt) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }

        const result = await ZImage.generate(prompt, {
            ratio: ratio || '1:1',
            resolution: resolution || '1K',
            noWatermark: noWatermark !== false
        });

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message, details: error.response?.data });
    }
});

app.get('/images', authenticate, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.page_size) || 20;

        const result = await ZImage.list(page, pageSize);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message, details: error.response?.data });
    }
});

// ===== Initialize & Start =====

async function start() {
    // Initialize session from cache/env
    await ZImage.initialize();

    // Start Telegram Bot (if token exists)
    startBot().catch(err => console.error('[Bot] Failed to start:', err.message));

    const sessionInfo = ZImage.getSessionInfo();

    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║       Z.AI Image API - OpenAI Compatible Server            ║
╠════════════════════════════════════════════════════════════╣
║  Port: ${String(PORT).padEnd(53)}║
║  Session: ${(sessionInfo.valid ? `✓ Valid (${sessionInfo.expiresInDays} days left)` : '✗ Not configured').padEnd(50)}║
║  API Key: ${(API_KEY ? '✓ Configured' : '✗ Missing').padEnd(50)}║
╚════════════════════════════════════════════════════════════╝

OpenAI Compatible Endpoints:
  GET  /v1/models                - List available models
  POST /v1/images/generations    - Generate images (OpenAI format)

Native Endpoints:
  GET  /health                   - Health check + session status
  GET  /options                  - Get supported ratios/resolutions
  POST /generate                 - Generate image (native format)

Environment:
  Z_IMAGE_SESSION   - Required: Session token
  Z_CHAT_TOKEN      - Optional: For auto-refresh (if missing, manual refresh needed)
  API_KEY           - Optional: Protects API (Default: sk-key)

Quick Verify:
  curl http://localhost:${PORT}/v1/models -H "Authorization: Bearer ${API_KEY}"
`);
    });
}

start().catch(console.error);

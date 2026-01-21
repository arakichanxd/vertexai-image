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
import ZImage from './z-image.js';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'sk-key';

app.use(express.json());

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

        // Generate images (Z.AI generates one at a time)
        const results = [];
        for (let i = 0; i < Math.min(n, 4); i++) {
            const result = await ZImage.generate(prompt, {
                ratio,
                resolution,
                noWatermark: true
            });

            // Extract image URL from response
            if (result.data && result.data.length > 0) {
                const imageData = result.data[0];
                results.push({
                    url: imageData.url || imageData.image_url,
                    revised_prompt: prompt
                });
            } else if (result.url) {
                results.push({
                    url: result.url,
                    revised_prompt: prompt
                });
            } else if (result.image_url) {
                results.push({
                    url: result.image_url,
                    revised_prompt: prompt
                });
            }
        }

        res.json({
            created: Math.floor(Date.now() / 1000),
            data: results
        });

    } catch (error) {
        console.error('[ERROR]', error.message);
        res.status(500).json({
            error: {
                message: error.message,
                type: 'server_error',
                details: error.response?.data
            }
        });
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

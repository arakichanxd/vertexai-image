/**
 * Z.AI Image Generation API Client
 * Reverse-engineered from image.z.ai
 * 
 * Session token from image.z.ai cookies
 * Set via environment variable: Z_IMAGE_SESSION
 * 
 * For refresh, provide chat.z.ai token: Z_CHAT_TOKEN
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export default class ZImage {
    static chatUrl = "https://chat.z.ai";
    static imageUrl = "https://image.z.ai";
    static clientId = "client_o3I6X8sE8SCtTHUWdMIhtg";

    // Supported options
    static ratios = ['1:1', '3:4', '4:3', '16:9', '9:16', '21:9', '9:21'];
    static resolutions = ['1K', '2K'];

    // Auth state
    static sessionToken = process.env.Z_IMAGE_SESSION || null;
    static chatToken = process.env.Z_CHAT_TOKEN || null;

    /**
     * Generate random request ID
     */
    static generateRequestId() {
        return crypto.randomBytes(11).toString('hex').slice(0, 21);
    }

    /**
     * Get cache file path
     */
    static getCacheFilePath() {
        return path.join(process.cwd(), '.zimage_session_cache.json');
    }

    /**
     * Load session from cache
     */
    static async loadSessionFromCache() {
        try {
            const cacheFilePath = this.getCacheFilePath();
            const data = await fs.readFile(cacheFilePath, 'utf8');
            const cached = JSON.parse(data);

            if (cached.sessionToken) {
                this.sessionToken = cached.sessionToken;
            }
            if (cached.chatToken) {
                this.chatToken = cached.chatToken;
            }

            return cached;
        } catch {
            return null;
        }
    }

    /**
     * Save session to cache
     */
    static async saveSessionToCache() {
        const cacheFilePath = this.getCacheFilePath();
        const data = {
            sessionToken: this.sessionToken,
            chatToken: this.chatToken,
            savedAt: new Date().toISOString()
        };
        await fs.writeFile(cacheFilePath, JSON.stringify(data, null, 2));
    }

    /**
     * Decode JWT to check expiration
     */
    static decodeJWT(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            return payload;
        } catch {
            return null;
        }
    }

    /**
     * Check if session needs refresh (expires in less than 1 day)
     */
    static sessionNeedsRefresh() {
        if (!this.sessionToken) return true;

        const payload = this.decodeJWT(this.sessionToken);
        if (!payload || !payload.exp) return true;

        const expiresIn = payload.exp * 1000 - Date.now();
        return expiresIn < 24 * 60 * 60 * 1000; // Less than 1 day
    }

    /**
     * Check if session is valid
     */
    static isSessionValid() {
        if (!this.sessionToken) return false;

        const payload = this.decodeJWT(this.sessionToken);
        if (!payload || !payload.exp) return false;

        return payload.exp * 1000 > Date.now();
    }

    /**
     * Get session info
     */
    static getSessionInfo() {
        if (!this.sessionToken) {
            return { valid: false, error: 'No session token provided' };
        }

        const payload = this.decodeJWT(this.sessionToken);
        if (!payload) {
            return { valid: false, error: 'Invalid JWT format' };
        }

        const expiresAt = new Date(payload.exp * 1000);
        const expiresIn = payload.exp * 1000 - Date.now();

        return {
            valid: expiresIn > 0,
            userId: payload.sub,
            clientId: payload.client_id,
            expiresAt: expiresAt.toISOString(),
            expiresInDays: Math.round(expiresIn / (1000 * 60 * 60 * 24)),
            expiresInHours: Math.round(expiresIn / (1000 * 60 * 60)),
            needsRefresh: this.sessionNeedsRefresh()
        };
    }

    /**
     * Set session token manually
     */
    static async setSession(token) {
        this.sessionToken = token;
        await this.saveSessionToCache();
        return this.getSessionInfo();
    }

    /**
     * Set chat token for refresh capability
     */
    static async setChatToken(token) {
        this.chatToken = token;
        await this.saveSessionToCache();
    }

    /**
     * Refresh session using chat token
     */
    static async refreshSession() {
        if (!this.chatToken) {
            console.log('[REFRESH] No chat token available for refresh');
            return false;
        }

        console.log('[REFRESH] Refreshing session token...');

        try {
            // Step 1: OAuth authorize
            const state = crypto.randomBytes(12).toString('base64');
            const oauthRes = await axios.post(
                `${this.chatUrl}/api/oauth/authorize`,
                new URLSearchParams({
                    action: 'approve',
                    client_id: this.clientId,
                    redirect_uri: 'https://image.z.ai/',
                    response_type: 'code',
                    state: state
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Bearer ${this.chatToken}`
                    }
                }
            );

            const redirectUrl = oauthRes.data.redirect_url;
            if (!redirectUrl) {
                console.log('[REFRESH] Failed - no redirect URL');
                return false;
            }

            const authCode = new URL(redirectUrl).searchParams.get('code');

            // Step 2: Exchange for image token
            const imageAuthRes = await axios.post(
                `${this.imageUrl}/api/v1/z-image/auth`,
                { code: authCode },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Request-ID': this.generateRequestId()
                    }
                }
            );

            const newToken = imageAuthRes.data.token;
            if (!newToken) {
                console.log('[REFRESH] Failed - no token in response');
                return false;
            }

            this.sessionToken = newToken;
            await this.saveSessionToCache();

            console.log('[REFRESH] ✓ Session refreshed successfully');
            return true;
        } catch (error) {
            console.log('[REFRESH] Failed:', error.response?.data?.message || error.message);
            return false;
        }
    }

    /**
     * Common headers for requests
     */
    static getHeaders() {
        return {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Origin': 'https://image.z.ai',
            'Referer': 'https://image.z.ai/',
            'X-Request-ID': this.generateRequestId(),
            'Cookie': `session=${this.sessionToken}`
        };
    }

    /**
     * Initialize - load from cache and attempt refresh if needed
     */
    static async initialize() {
        await this.loadSessionFromCache();

        if (this.sessionNeedsRefresh() && this.chatToken) {
            await this.refreshSession();
        }

        return this.getSessionInfo();
    }

    /**
     * Ensure session is valid
     */
    static async ensureSession() {
        // Try loading from cache if no session
        if (!this.sessionToken) {
            await this.loadSessionFromCache();
        }

        // Try refresh if session is expired or near expiry
        if (!this.isSessionValid() || this.sessionNeedsRefresh()) {
            const refreshed = await this.refreshSession();
            if (!refreshed && !this.isSessionValid()) {
                throw new Error('Session expired. Please provide a fresh session token via setSession() or Z_IMAGE_SESSION env var.');
            }
        }
    }

    /**
     * Generate image
     * @param {string} prompt - The image prompt
     * @param {object} options - Generation options
     * @param {string} options.ratio - Aspect ratio (default: '1:1')
     * @param {string} options.resolution - Resolution '1K' or '2K' (default: '1K')
     * @param {boolean} options.noWatermark - Remove watermark (default: true)
     */
    static async generate(prompt, options = {}) {
        await this.ensureSession();

        const ratio = options.ratio || '1:1';
        const resolution = options.resolution || '1K';
        const noWatermark = options.noWatermark !== false;

        // Validate options
        if (!this.ratios.includes(ratio)) {
            throw new Error(`Invalid ratio: ${ratio}. Valid: ${this.ratios.join(', ')}`);
        }
        if (!this.resolutions.includes(resolution)) {
            throw new Error(`Invalid resolution: ${resolution}. Valid: ${this.resolutions.join(', ')}`);
        }

        console.log(`[GENERATE] Creating image...`);
        console.log(`           Prompt: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
        console.log(`           Ratio: ${ratio}, Resolution: ${resolution}`);

        const response = await axios.post(
            `${this.imageUrl}/api/proxy/images/generate`,
            {
                prompt: prompt,
                ratio: ratio,
                resolution: resolution,
                rm_label_watermark: noWatermark
            },
            { headers: this.getHeaders() }
        );

        console.log(`[GENERATE] ✓ Image created`);

        return response.data;
    }

    /**
     * List generated images
     * @param {number} page - Page number (default: 1)
     * @param {number} pageSize - Items per page (default: 20)
     */
    static async list(page = 1, pageSize = 20) {
        await this.ensureSession();

        const response = await axios.get(
            `${this.imageUrl}/api/proxy/images/list`,
            {
                params: { page, page_size: pageSize },
                headers: this.getHeaders()
            }
        );

        return response.data;
    }

    /**
     * Get image by ID
     * @param {string} imageId - Image ID
     */
    static async get(imageId) {
        await this.ensureSession();

        const response = await axios.get(
            `${this.imageUrl}/api/proxy/images/${imageId}`,
            { headers: this.getHeaders() }
        );

        return response.data;
    }
}

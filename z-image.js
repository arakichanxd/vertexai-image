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
     * Set specific cookie value dynamically
     * @param {string} name - Cookie name (e.g. 'acw_tc', '_c_WBKFRo')
     * @param {string} value - Cookie value
     */
    static async setSpecificCookie(name, value) {
        let updated = false;

        // Remove trailing semicolon if present
        value = value.trim().replace(/;$/, '');

        switch (name) {
            case 'session':
                this.sessionToken = value;
                updated = true;
                break;
            case '_c_WBKFRo':
                this.cookieWBKFRO = value;
                updated = true;
                break;
            case 'acw_tc':
                this.cookieACWTC = value;
                updated = true;
                break;
            case 'c':
                this.cookieC = value;
                updated = true;
                break;
            case 'ssxmod_itna':
                this.cookieSSXMOD = value;
                updated = true;
                break;
            case 'ssxmod_itna2':
                this.cookieSSXMOD2 = value;
                updated = true;
                break;
            default:
                console.log(`[ZImage] Unknown cookie: ${name}`);
        }

        if (updated) {
            console.log(`[ZImage] Updated cookie: ${name}`);
            // We could save to cache here if we want persistence
            // await this.saveSessionToCache(); 
        }
        return updated;
    }

    /**
     * Import cookies from Netscape format text (cookies.txt)
     * @param {string} text - Content of cookies.txt
     */
    static async importCookiesFromText(text) {
        const lines = text.split('\n');
        let count = 0;

        for (const line of lines) {
            if (!line || line.startsWith('#')) continue;

            // Try Netscape format (7 columns)
            // domain flag path secure expiration name value
            const parts = line.split('\t');
            if (parts.length >= 7) {
                const name = parts[5];
                const value = parts[6];
                if (await this.setSpecificCookie(name, value)) {
                    count++;
                }
            }
            // Try simple key=value format
            else if (line.includes('=')) {
                // Determine split point (first = only)
                const idx = line.indexOf('=');
                const name = line.substring(0, idx).trim();
                const value = line.substring(idx + 1).trim();
                if (await this.setSpecificCookie(name, value)) {
                    count++;
                }
            }
        }

        return count;
    }

    /**
     * Common headers for requests
     */
    static getHeaders() {
        // Construct cookie string from specific variables
        const cookies = [];

        // Always add session if present
        if (this.sessionToken) cookies.push(`session=${this.sessionToken}`);

        // Add optional/WAF cookies if provided
        if (this.cookieWBKFRO) cookies.push(`_c_WBKFRo=${this.cookieWBKFRO}`);
        if (this.cookieACWTC) cookies.push(`acw_tc=${this.cookieACWTC}`);
        if (this.cookieC) cookies.push(`c=${this.cookieC}`);
        if (this.cookieSSXMOD) cookies.push(`ssxmod_itna=${this.cookieSSXMOD}`);
        if (this.cookieSSXMOD2) cookies.push(`ssxmod_itna2=${this.cookieSSXMOD2}`);

        return {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'User-Agent': this.userAgent,
            'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Origin': 'https://image.z.ai',
            'Referer': 'https://image.z.ai/',
            'X-Request-ID': this.generateRequestId(),
            'Cookie': cookies.join('; ')
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

    /**
     * Download image and return as Base64
     * @param {string} url - Image URL
     * @returns {Promise<string>} - Base64 string
     */
    static async downloadAsBase64(url) {
        try {
            // Check if it's an OSS URL (or external)
            // If so, do NOT use 	"toolName": shared.TaskBoundaryToolName, headers as they contain Host/Origin/Cookies for the API domain
            // which will cause 403 Forbidden on Aliyun OSS
            const isExternal = url.includes('aliyuncs.com') || url.includes('oss-cn');

            const headers = isExternal ? {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Referer': 'https://image.z.ai/' // Sometimes helps, sometimes hurts. Safe bet for OSS usually.
            } : this.getHeaders();

            const response = await axios.get(url, {
                headers: headers,
                responseType: 'arraybuffer'
            });

            return Buffer.from(response.data, 'binary').toString('base64');
        } catch (error) {
            console.error('[ZImage] Failed to download image for Base64 conversion:', error.message);
            // Retry without Referer if 403
            if (error.response && error.response.status === 403) {
                try {
                    console.log('[ZImage] Retrying download without headers...');
                    const response = await axios.get(url, {
                        responseType: 'arraybuffer'
                    });
                    return Buffer.from(response.data, 'binary').toString('base64');
                } catch (retryErr) {
                    console.error('[ZImage] Retry failed:', retryErr.message);
                }
            }
            throw error;
        }
    }
}

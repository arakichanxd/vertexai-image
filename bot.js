/**
 * Telegram Bot for Z.AI Image Generation
 * 
 * Commands:
 * /start - Welcome message
 * /status - Check system and session status
 * /imagine <prompt> - Generate image with model selection
 * /quick <prompt> - Quick generate with default model (1K)
 * 
 * Features:
 * - Interactive model selection (1K/2K)
 * - Aspect ratio selection
 * - Auto-forwarding of all generated images
 */

import TelegramBot from 'node-telegram-bot-api';
import ZImage from './z-image.js';

const token = process.env.TELEGRAM_BOT_TOKEN;

// Store pending generation requests
const pendingGenerations = new Map();

export async function startBot() {
    if (!token) {
        console.log('[Bot] TELEGRAM_BOT_TOKEN not found in env. Bot skipped.');
        return;
    }

    console.log('[Bot] Starting Telegram Bot...');
    const bot = new TelegramBot(token, { polling: true });

    // Handle /start
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId,
            `🎨 *Z.AI Image Generator Bot*

Welcome! I can generate high-quality anime-style images using Z.AI.

*Commands:*
/imagine <prompt> - Generate with model selection
/quick <prompt> - Quick generate (1K, 1:1)
/status - Check server status

*Examples:*
\`/imagine a cute cat girl with blue eyes\`
\`/quick cyberpunk city at night\`

*Features:*
✅ Choose quality: 1K (fast) or 2K (HD)
✅ Select aspect ratio (1:1, 16:9, 9:16, etc.)
✅ Auto-forwarding of all server generations

Ready to create amazing images! 🚀`, { parse_mode: 'Markdown' });
    });

    // Handle /status
    bot.onText(/\/status/, async (msg) => {
        const chatId = msg.chat.id;
        const info = ZImage.getSessionInfo();

        const status = `*🖥️ System Status*
${info.valid ? '✅' : '❌'} Server Running

*📊 Session Info:*
Status: ${info.valid ? '✅ Valid' : '❌ Invalid/Expired'}
Expires: ${info.expiresInDays} days (${info.expiresInHours} hours)

*🔧 Configuration:*
Session Token: ${ZImage.sessionToken ? '✅ Set' : '❌ Missing'}
Supported Ratios: ${ZImage.ratios.join(', ')}
Resolutions: ${ZImage.resolutions.join(', ')}
`;
        bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
    });

    // Capture Chat ID from any message
    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        // Log it so user can find it
        if (!process.env.TELEGRAM_CHAT_ID) {
            console.log(`[Bot] Captured Chat ID: ${chatId}. Add 'TELEGRAM_CHAT_ID=${chatId}' to .env to persist.`);
        }
        // Store temporarily in memory if not in env
        if (!currentChatId) {
            currentChatId = chatId;
        }
    });

    // Handle /imagine command with interactive selection
    bot.onText(/\/imagine (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const prompt = match[1].trim();

        if (!prompt) {
            return bot.sendMessage(chatId, '❌ Please provide a prompt.\n\nExample: `/imagine a cute cat girl with blue eyes`', { parse_mode: 'Markdown' });
        }

        // Store prompt for callback
        const requestId = `${chatId}_${Date.now()}`;
        pendingGenerations.set(requestId, { prompt, chatId });

        // Show model selection
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '⚡ 1K (Fast)', callback_data: `model_1K_${requestId}` },
                    { text: '💎 2K (HD)', callback_data: `model_2K_${requestId}` }
                ],
                [
                    { text: '❌ Cancel', callback_data: `cancel_${requestId}` }
                ]
            ]
        };

        bot.sendMessage(chatId, 
            `🎨 *Image Generation*\n\nPrompt: _${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}_\n\nSelect quality:`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    });

    // Handle /quick command (fast generation with defaults)
    bot.onText(/\/quick (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const prompt = match[1].trim();

        if (!prompt) {
            return bot.sendMessage(chatId, '❌ Please provide a prompt.\n\nExample: `/quick a cute cat`', { parse_mode: 'Markdown' });
        }

        await generateAndSend(bot, chatId, prompt, '1K', '1:1');
    });

    // Handle callback queries (button clicks)
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        // Parse callback data
        if (data.startsWith('model_')) {
            const [, resolution, requestId] = data.split('_');
            const pending = pendingGenerations.get(requestId);

            if (!pending) {
                return bot.answerCallbackQuery(query.id, { text: '❌ Request expired. Please try again.' });
            }

            // Show aspect ratio selection
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '1:1 Square', callback_data: `ratio_1:1_${resolution}_${requestId}` },
                        { text: '16:9 Wide', callback_data: `ratio_16:9_${resolution}_${requestId}` }
                    ],
                    [
                        { text: '9:16 Portrait', callback_data: `ratio_9:16_${resolution}_${requestId}` },
                        { text: '4:3 Classic', callback_data: `ratio_4:3_${resolution}_${requestId}` }
                    ],
                    [
                        { text: '3:4 Portrait', callback_data: `ratio_3:4_${resolution}_${requestId}` },
                        { text: '21:9 Cinema', callback_data: `ratio_21:9_${resolution}_${requestId}` }
                    ],
                    [
                        { text: '❌ Cancel', callback_data: `cancel_${requestId}` }
                    ]
                ]
            };

            bot.editMessageText(
                `🎨 *Image Generation*\n\nQuality: *${resolution}*\nPrompt: _${pending.prompt.slice(0, 80)}${pending.prompt.length > 80 ? '...' : ''}_\n\nSelect aspect ratio:`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );

            bot.answerCallbackQuery(query.id);

        } else if (data.startsWith('ratio_')) {
            const parts = data.split('_');
            const ratio = parts[1];
            const resolution = parts[2];
            const requestId = parts.slice(3).join('_');
            
            const pending = pendingGenerations.get(requestId);

            if (!pending) {
                return bot.answerCallbackQuery(query.id, { text: '❌ Request expired. Please try again.' });
            }

            // Delete the selection message
            bot.deleteMessage(chatId, messageId).catch(() => {});

            // Start generation
            bot.answerCallbackQuery(query.id, { text: '🎨 Generating...' });
            
            await generateAndSend(bot, chatId, pending.prompt, resolution, ratio);
            
            // Clean up
            pendingGenerations.delete(requestId);

        } else if (data.startsWith('cancel_')) {
            const requestId = data.replace('cancel_', '');
            pendingGenerations.delete(requestId);
            
            bot.deleteMessage(chatId, messageId).catch(() => {});
            bot.answerCallbackQuery(query.id, { text: '❌ Cancelled' });
        }
    });

    console.log('[Bot] Telegram Bot is listening.');
}

/**
 * Generate image and send to Telegram
 */
async function generateAndSend(bot, chatId, prompt, resolution, ratio) {
    const startTime = Date.now();
    
    const statusMsg = await bot.sendMessage(chatId, 
        `⏳ *Generating Image...*\n\n` +
        `Quality: *${resolution}*\n` +
        `Ratio: *${ratio}*\n` +
        `Prompt: _${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}_\n\n` +
        `Please wait... This may take ${resolution === '2K' ? '1-2 minutes' : '30-60 seconds'}.`,
        { parse_mode: 'Markdown' }
    );

    try {
        // Generate image
        const result = await ZImage.generate(prompt, {
            resolution,
            ratio,
            noWatermark: true
        });

        // Find image URL
        const findImageUrl = (obj) => {
            if (!obj) return null;
            if (typeof obj === 'string') {
                if (obj.match(/^https?:\/\/.*\.(png|jpg|jpeg|webp)/i) || obj.includes('/z_image/')) return obj;
                return null;
            }
            if (typeof obj === 'object') {
                if (obj.url && typeof obj.url === 'string' && (obj.url.startsWith('http') || obj.url.startsWith('/'))) return obj.url;
                if (obj.image_url) return obj.image_url;
                for (const key in obj) {
                    const found = findImageUrl(obj[key]);
                    if (found) return found;
                }
            }
            return null;
        };

        const imageUrl = findImageUrl(result);

        if (!imageUrl) {
            throw new Error('Could not extract image URL from response');
        }

        // Download image
        const b64 = await ZImage.downloadAsBase64(imageUrl);
        const imgBuffer = Buffer.from(b64, 'base64');

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // Send image
        const caption = `✨ *Image Generated!*\n\n` +
            `Quality: ${resolution}\n` +
            `Ratio: ${ratio}\n` +
            `Time: ${elapsed}s\n\n` +
            `Prompt: ${prompt.length > 150 ? prompt.slice(0, 150) + '...' : prompt}`;

        await bot.sendPhoto(chatId, imgBuffer, { 
            caption: caption,
            parse_mode: 'Markdown' 
        });

        // Send full prompt as file if too long
        if (prompt.length > 150) {
            const promptBuffer = Buffer.from(prompt, 'utf-8');
            await bot.sendDocument(chatId, promptBuffer, {}, {
                filename: 'full_prompt.txt',
                contentType: 'text/plain'
            });
        }

        // Delete status message
        bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

    } catch (error) {
        console.error(`[Bot] Generation failed: ${error.message}`);
        
        bot.editMessageText(
            `❌ *Generation Failed*\n\nError: ${error.message}\n\nPlease try again or contact support.`,
            {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown'
            }
        ).catch(() => {
            bot.sendMessage(chatId, `❌ Generation failed: ${error.message}`);
        });
    }
}

// Global variable to hold chat ID (from env or captured)
let currentChatId = process.env.TELEGRAM_CHAT_ID;

// Helper to send image to admin
export async function sendImageToAdmin(imageBuffer, caption, fullPromptText) {
    // strict check: if we don't have a token, we can't do anything
    if (!token) return;

    // Update chat ID from env if changed hot
    if (process.env.TELEGRAM_CHAT_ID) currentChatId = process.env.TELEGRAM_CHAT_ID;

    if (!currentChatId) {
        console.log('[Bot] Cannot forward image: No Chat ID configured. Run /start in bot.');
        return;
    }

    try {
        const bot = new TelegramBot(token); // lightweight instance for sending

        // 1. Send the Photo
        await bot.sendPhoto(currentChatId, imageBuffer, { caption: caption, parse_mode: 'Markdown' });

        // 2. Send the Prompt as a text file (if provided)
        if (fullPromptText) {
            const promptBuffer = Buffer.from(fullPromptText, 'utf-8');
            await bot.sendDocument(currentChatId, promptBuffer, {}, {
                filename: 'prompt.txt',
                contentType: 'text/plain'
            });
        }

        console.log('[Bot] Image & Prompt forwarded to Telegram.');
    } catch (error) {
        console.error(`[Bot] Failed to forward image: ${error.message}`);
    }
}

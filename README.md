# 🎨 Z.AI Image API (Reverse Engineered)

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Status](https://img.shields.io/badge/status-stable-brightgreen)
![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-412991.svg)

**A powerful, reverse-engineered API client for Z.AI's image generation platform**

*Drop-in replacement for DALL-E 3 with OpenAI-compatible endpoints*

[🚀 Quick Start](#-getting-started) • [📖 Documentation](#-api-usage) • [🤖 Telegram Bot](#-telegram-bot-integration) • [⚙️ Deployment](#-deployment)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔄 **OpenAI Compatible**
Fully compatible `/v1/images/generations` endpoint. Works with OpenWebUI, LibreChat, and any OpenAI-compatible client.

### 🖼️ **Dual Quality Modes**
- **z-image**: Fast 1K generation (~30s)
- **z-image-pro**: High-quality 2K generation (~2min)

### 🔐 **Smart Session Management**
Automatic session refresh, caching, and JWT validation. No manual token management needed.

</td>
<td width="50%">

### ⚡ **Production Ready**
- Express.js server with proper error handling
- Static file serving for generated images
- Automatic cleanup of old files
- Comprehensive logging and timing metrics

### 🤖 **Telegram Integration**
Real-time image forwarding, status monitoring, and remote cookie management via Telegram bot.

### 🛡️ **Secure by Default**
API key authentication, environment-based configuration, and proper secret management.

</td>
</tr>
</table>

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **Z.AI Account** (free - sign up at [image.z.ai](https://image.z.ai))

### 📦 Installation

```bash
# Clone the repository
git clone https://github.com/arakichanxd/vertexai-image.git
cd vertexai-image

# Install dependencies
npm install

# Copy environment template
cp env.example .env
```

### 🔑 Getting Your Session Token

1. Visit [image.z.ai](https://image.z.ai) and log in
2. Open DevTools (`F12` or `Ctrl+Shift+I`)
3. Go to **Application** → **Cookies** → `https://image.z.ai`
4. Copy the value of the `session` cookie
5. Paste it into your `.env` file:

```env
# Required
Z_IMAGE_SESSION=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional (recommended)
API_KEY=sk-your-secret-key-here

# Optional - Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=your_chat_id

# Optional - Server
PORT=3000
```

### ▶️ Start the Server

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║       Z.AI Image API - OpenAI Compatible Server            ║
╠════════════════════════════════════════════════════════════╣
║  Port: 3000                                                 ║
║  Session: ✓ Valid (30 days left)                            ║
║  API Key: ✓ Configured                                      ║
╚════════════════════════════════════════════════════════════╝
```

### ✅ Quick Test

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer sk-your-secret-key"
```

---

## 📖 API Usage

### 🔌 OpenAI Compatible Endpoint

Perfect for **OpenWebUI**, **LibreChat**, or any OpenAI-compatible client!

**Endpoint:** `POST /v1/images/generations`

```bash
curl http://localhost:3000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-secret-key" \
  -d '{
    "model": "z-image-pro",
    "prompt": "A serene anime-style cat girl looking at the starry night sky",
    "size": "1024x1024",
    "response_format": "url",
    "n": 1
  }'
```

**Response:**
```json
{
  "created": 1768977932,
  "data": [
    {
      "url": "http://localhost:3000/generated/1768977932167_A_serene_anime_style_cat_girl.png",
      "revised_prompt": "A serene anime-style cat girl looking at the starry night sky"
    }
  ]
}
```

### 🎨 Available Models

| Model | Quality | Resolution | Speed | OpenAI Equivalent |
|-------|---------|------------|-------|-------------------|
| `z-image` | Standard | 1024×1024 | ~30s | `dall-e-2` |
| `z-image-pro` | High | 2048×2048 | ~2min | `dall-e-3` |

> **💡 Tip:** Use `z-image` for faster results, `z-image-pro` for higher quality. 2K images may timeout on free hosting tiers.

### 🎯 Supported Sizes

| Size | Ratio | Best For |
|------|-------|----------|
| `1024x1024` | 1:1 | Square images, avatars |
| `1024x1792` | 9:16 | Vertical, mobile wallpapers |
| `1792x1024` | 16:9 | Horizontal, desktop wallpapers |

### ⚙️ Native Z.AI Endpoint

For advanced control over aspect ratios and resolutions.

**Endpoint:** `POST /generate`

```bash
curl http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-secret-key" \
  -d '{
    "prompt": "Cinematic landscape with mountains at sunset",
    "ratio": "21:9",
    "resolution": "2K",
    "noWatermark": true
  }'
```

**Supported Ratios:** `1:1`, `3:4`, `4:3`, `16:9`, `9:16`, `21:9`, `9:21`  
**Resolutions:** `1K`, `2K`

### 📊 Other Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | List available models |
| `/health` | GET | Server health & session status |
| `/options` | GET | Get supported ratios/resolutions |
| `/session` | GET | Check session validity |
| `/images` | GET | List generated images |

---

## 🤖 Telegram Bot Integration

Get real-time notifications and monitor your server via Telegram!

### 🎯 Features

- **📸 Auto-Forward Images** - Every generated image is sent to your Telegram
- **📊 Status Monitoring** - Check server health and session validity
- **🎨 Direct Generation** - Generate images directly from Telegram
- **📝 Prompt Logging** - Full prompts saved as text files

### 🔧 Setup

1. **Create a Bot**
   - Message [@BotFather](https://t.me/BotFather) on Telegram
   - Send `/newbot` and follow instructions
   - Copy the bot token

2. **Configure Environment**
   ```env
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
   TELEGRAM_CHAT_ID=your_chat_id  # Optional, auto-detected
   ```

3. **Start Chatting**
   - Send `/start` to your bot
   - Your Chat ID will be auto-detected and logged

### 💬 Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and bot info |
| `/status` | Check server status and session validity |
| `/imagine <prompt>` | Generate an image directly from Telegram |

**Example:**
```
/imagine A beautiful anime cat girl under the stars
```

### 📸 Auto-Forwarding

Every image generated via the API is automatically forwarded to your Telegram with:
- 🖼️ The generated image
- 📝 Full prompt as a text file
- ⏱️ Generation timestamp

---

## � Deployment

### Render (Recommended)

1. **Create New Web Service**
   - Connect your GitHub repository
   - Build Command: `npm install`
   - Start Command: `npm start`

2. **Environment Variables**
   ```
   Z_IMAGE_SESSION=your_session_token
   API_KEY=sk-your-secret-key
   TELEGRAM_BOT_TOKEN=your_bot_token (optional)
   TELEGRAM_CHAT_ID=your_chat_id (optional)
   ```

3. **Deploy** 🚀

> **Note:** Free tier has 100s timeout. 2K images may timeout. Consider upgrading for production use.

### Railway / Heroku / Vercel

Similar setup - just ensure:
- Node.js 18+ runtime
- Environment variables configured
- Port is set dynamically (Railway/Heroku auto-set `PORT`)

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `Z_IMAGE_SESSION` | ✅ Yes | - | Session token from image.z.ai |
| `API_KEY` | ⚠️ Recommended | `sk-key` | API authentication key |
| `PORT` | ❌ No | `3000` | Server port |
| `TELEGRAM_BOT_TOKEN` | ❌ No | - | Telegram bot token |
| `TELEGRAM_CHAT_ID` | ❌ No | - | Your Telegram chat ID |
| `Z_CHAT_TOKEN` | ❌ No | - | For auto-refresh (advanced) |

### Session Management

- **Validity:** 30 days
- **Auto-refresh:** Supported with `Z_CHAT_TOKEN`
- **Caching:** Sessions cached in `.zimage_session_cache.json`
- **Monitoring:** Check `/health` endpoint for status

---

## 🛠️ Development

### Run Tests

```bash
npm test
```

### Debug Mode

Check server logs for detailed timing information:
```
[REQUEST] New image generation request
[REQUEST] Model: z-image-pro, Size: 1024x1024
[TIMING] Generation took 135830ms
[TIMING] Download took 1295ms
[RESPONSE] Sending response after 137131ms (137.1s)
```

### File Structure

```
├── index.js              # Main Express server
├── z-image.js           # Z.AI API client
├── bot.js               # Telegram bot integration
├── generated/           # Generated images (auto-created)
├── .env                 # Environment variables
└── package.json         # Dependencies
```

---

## 🐛 Troubleshooting

### "Session expired" Error
- Get a fresh session token from image.z.ai
- Update `Z_IMAGE_SESSION` in `.env`
- Restart the server

### Timeout on 2K Images
- 2K generation takes ~2 minutes
- Use `z-image` model for faster results
- Deploy to paid hosting tier with longer timeouts
- Consider using webhooks for async processing

### Images Not Showing in OpenWebUI
- Ensure `/generated` folder is accessible
- Check that static file serving is enabled
- Verify your `PUBLIC_URL` if using tunnels

---

## 📊 Performance

| Model | Resolution | Avg. Time | File Size |
|-------|------------|-----------|-----------|
| z-image | 1024×1024 | ~30s | ~500KB |
| z-image-pro | 2048×2048 | ~2min | ~2MB |

> Times measured on cloud infrastructure. Local + tunnel may be slower.

---

## ⚠️ Disclaimer

This project is for **educational purposes only**. It reverse-engineers the Z.AI internal API. 

- ✅ Use responsibly
- ✅ Comply with Z.AI's terms of service
- ✅ Don't abuse rate limits
- ❌ Not affiliated with Z.AI

---

## 📝 License

MIT License - See [LICENSE](LICENSE) for details

---

## 🙏 Acknowledgments

- **Z.AI** for the amazing image generation service
- **OpenAI** for the API standard
- **Community** for testing and feedback

---

<div align="center">

**Made with ❤️ by [arakichanxd](https://github.com/arakichanxd)**

⭐ Star this repo if you find it useful!

[Report Bug](https://github.com/arakichanxd/vertexai-image/issues) • [Request Feature](https://github.com/arakichanxd/vertexai-image/issues)

</div>

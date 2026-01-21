# 🎨 Z.AI Image API (Reverse Engineered)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Status](https://img.shields.io/badge/status-stable-blue)

A powerful, reverse-engineered API client for Z.AI's image generation platform, providing an **OpenAI-compatible** interface. Use it as a drop-in replacement for DALL-E 3 in your existing applications!

**Repository:** [https://github.com/arakichanxd/vertexai-image](https://github.com/arakichanxd/vertexai-image)

---

## ✨ Features

- **🔄 OpenAI Compatible**: Fully compatible `/v1/images/generations` endpoint.
- **🖼️ High Quality**: Access Z.AI's 1K and 2K image generation models.
- **🔐 Session Management**: Robust session handling with auto-refresh capabilities.
- **⚡ Fast & Lightweight**: Built on Node.js and Express with minimal dependencies.
- **🛡️ Secure**: API Key protection for your specialized access.

## 🚀 Getting Started

### Prerequisites

- Node.js installed (v18+)
- A Z.AI account (to obtain session cookies)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/arakichanxd/vertexai-image.git
   cd vertexai-image
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the root directory:
   ```env
   # Your preferred API Key for the server (Default: sk-key)
   API_KEY=sk-your-secret-key

   # Session Token from image.z.ai cookies (Required)
   Z_IMAGE_SESSION=eyJhbGciOiJIUz...

   # (Optional) Specific Cookies for fingerprinting/WAF
   Z_COOKIE_WBKFRO=...       # _c_WBKFRo
   Z_COOKIE_ACW_TC=...       # acw_tc
   Z_COOKIE_C=...            # c
   Z_COOKIE_SSXMOD=...       # ssxmod_itna
   Z_COOKIE_SSXMOD2=...      # ssxmod_itna2

   # (Optional) Custom User Agent
   Z_USER_AGENT=Mozilla/5.0...

   # (Optional) Chat Token for auto-refresh
   # Z_CHAT_TOKEN=eyJhb...

   PORT=3000
   ```
   > **How to get cookies:** Log in to [image.z.ai](https://image.z.ai), open DevTools (F12) > Application > Cookies, and copy the value of `session`.

4. **Start the Server**
   ```bash
   npm start
   ```

---

## 📖 API Usage

### 1. OpenAI Compatible Endpoint
Use this with any OpenAI SDK or compatible library.

**Endpoint:** `POST /v1/images/generations`  
**Auth:** `Bearer <API_KEY>`

```bash
curl http://localhost:3000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-secret-key" \
  -d '{
    "model": "z-image-pro",
    "prompt": "A cyberpunk street food vendor in Tokyo, neon lights, 8k resolution",
    "size": "1024x1024",
    "n": 1
  }'
```

### 2. Available Models

| Model Name | Quality | Resolution | Open AI Mapping |
|------------|---------|------------|-----------------|
| `z-image` | Standard | 1K | `dall-e-2` |
| `z-image-pro`| High | 2K | `dall-e-3` |

### 3. Native Endpoint
Access full control over aspect ratios.

**Endpoint:** `POST /generate`

```bash
curl http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-secret-key" \
  -d '{
    "prompt": "Cinematic landscape",
    "ratio": "16:9",
    "resolution": "2K"
  }'
```

**Supported Ratios:** `1:1`, `3:4`, `4:3`, `16:9`, `9:16`, `21:9`, `9:21`

---

## 🤖 Telegram Bot Integration

Manage your cookies remotely without restarting the server!

1. **Setup**:
   - Talk to [@BotFather](https://t.me/BotFather) to create a new bot.
   - Copy the Token.
   - Add to `.env`: `TELEGRAM_BOT_TOKEN=your_token_here`

2. **Usage**:
   - `/start` - Welcome guide.
   - `/status` - Check if session is valid and see loaded cookies.
   - `/set <name> <value>` - Manually set a cookie (e.g., `/set _c_WBKFRo val...`).
   - **Upload `cookies.txt`** - Send a Netscape-formatted cookie file to bulk import.

---

## 🛠️ Development

Run the test suite to verify your configuration:

```bash
npm test
```

## ⚠️ Disclaimer

This project is for educational purposes only. It interacts with the Z.AI internal API. Use responsibly and ensure you comply with Z.AI's terms of service.

---

Made with ❤️ by [arakichanxd](https://github.com/arakichanxd)

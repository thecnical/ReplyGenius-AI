# ReplyGenius AI - Chrome Extension

AI-powered browser extension that generates smart replies for LinkedIn, WhatsApp, Gmail, and Twitter/X.

## Features

- ⚡ One-click AI reply generation
- 🎨 Professional & modern glassmorphism UI
- 🔄 Multi-platform support (LinkedIn, WhatsApp, Gmail, Twitter/X)
- 🚀 Fast AI models via OpenRouter
- 🔒 Secure API key storage
- 📊 Usage analytics

## Installation

### Local Development

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `replygenius-extension` folder

### Configure Backend

The extension requires a backend server to generate AI replies. You have two options:

#### Option 1: Local Backend

1. Navigate to `replygenius-backend/`
2. Copy `.env.example` to `.env` and add your API keys:
   ```
   OPENROUTER_API_KEY=your_openrouter_key
   BYTEZ_API_KEY=your_bytez_key
   ```
3. Run `npm install && npm start`
4. The API will run on `http://localhost:3000`

#### Option 2: Deploy to Render (Free)

1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Create a new Web Service
4. Connect your GitHub repository
5. Add environment variables:
   - `OPENROUTER_API_KEY` - Your OpenRouter API key
   - `BYTEZ_API_KEY` - Your Bytez AI API key (optional)
   - `NODE_ENV` = `production`
6. Deploy!

### Configure Extension

1. Click the extension icon in Chrome
2. Click the ⚙️ Settings button
3. Update the API Endpoint to your backend URL
4. Save settings

## Usage

### Popup Mode

1. Click the ReplyGenius AI icon in Chrome
2. Enter your message
3. Select tone (Professional, Casual, Friendly, etc.)
4. Select platform (LinkedIn, WhatsApp, Gmail, Twitter)
5. Click "Generate Reply"
6. Select a generated reply and click "Use This Reply"

### Inline Mode

1. Navigate to LinkedIn, WhatsApp, Gmail, or Twitter
2. Find a text input field
3. A "⚡ Reply" button will appear above the input
4. Click it to generate AI replies
5. Confirm to insert the generated reply

## Chrome Web Store

The extension is ready for Chrome Web Store deployment. Package it:

```bash
cd replygenius-extension
zip -r replygenius-ai.zip .
```

Submit at: https://chrome.google.com/webstore/developer/dashboard

## Privacy

See [PRIVACY.md](./PRIVACY.md) for details on data handling.

## License

MIT

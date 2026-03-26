# ReplyGenius AI Backend

Production-ready AI reply generation backend with multi-provider support.

## Features

- **Multi-Provider AI Routing**: OpenRouter (primary) + Bytez AI (fallback)
- **Circuit Breaker**: Automatic failover when providers fail
- **Hybrid Caching**: In-memory + Redis support
- **SSE Streaming**: Real-time typing effect for AI responses
- **JWT Authentication**: User identity and tracking
- **AES-256 Encryption**: Secure API key storage
- **Smart Analytics**: Auto-routing optimization based on performance

## Quick Start

### 1. Installation

```bash
cd replygenius-backend
npm install
```

### 2. Configuration

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your API keys
# Add OpenRouter API key: https://openrouter.ai/keys
# Add Bytez API key: https://bytez.com/dashboard
```

### 3. Run Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 4. Run Tests

```bash
npm test
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate-reply` | Generate AI reply |
| POST | `/api/generate-reply/stream` | Streaming reply |
| GET | `/api/models` | List available models |
| GET | `/api/health` | Health check |
| GET | `/api/analytics` | Analytics summary |
| GET | `/api/history` | Reply history |
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login user |

## Deployment

### Vercel

```bash
npm i -g vercel
vercel --prod
```

### Render

```bash
render deploy
```

## Environment Variables

See `.env.example` for all available configuration options.

## License

MIT

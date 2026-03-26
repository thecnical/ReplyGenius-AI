/**
 * ReplyGenius AI - OpenRouter Provider Adapter
 * Primary AI provider with GPT, DeepSeek, Mistral, Claude models
 */

const axios = require('axios');
const BaseProvider = require('./base-provider');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('OpenRouterProvider');

class OpenRouterProvider extends BaseProvider {
  constructor() {
    super({
      name: 'OpenRouter',
      apiKey: config.providers.openrouter.apiKey,
      baseUrl: config.providers.openrouter.baseUrl,
      timeout: config.providers.openrouter.timeout,
      maxRetries: config.providers.openrouter.maxRetries,
      models: config.providers.openrouter.models
    });
  }

  /**
   * Generate reply using OpenRouter API
   */
  async generateReply(messages, options = {}) {
    const { model = this.models.balanced, tone = 'professional', platform = 'linkedin', stream = false } = options;

    const systemPrompt = this._buildSystemPrompt(tone, platform);

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ];

    const requestBody = {
      model,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 500,
      top_p: 0.9,
      ...(stream && { stream: true })
    };

    logger.info(`Generating reply with OpenRouter: ${model}`);

    return this.withRetry(async () => {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        requestBody,
        {
          headers: this.getHeaders({
            'HTTP-Referer': 'https://replygenius.ai',
            'X-Title': 'ReplyGenius AI'
          }),
          timeout: this.timeout,
          ...(stream && { responseType: 'stream' })
        }
      );

      if (stream) {
        return this._handleStreamResponse(response.data);
      }

      const content = response.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Invalid response from OpenRouter');
      }

      return {
        replies: this._parseReplies(content),
        provider: this.name,
        model: response.data.model,
        usage: response.data.usage
      };
    });
  }

  /**
   * Build system prompt based on tone and platform
   */
  _buildSystemPrompt(tone, platform) {
    const toneInstructions = {
      professional: 'Write in a professional, business-appropriate manner.',
      casual: 'Write in a casual, friendly conversational tone.',
      friendly: 'Write in a warm, friendly, approachable manner.',
      funny: 'Add subtle humor while remaining appropriate.',
      flirty: 'Add a subtle, tasteful flirty undertone.',
      formal: 'Write in a formal, polished, official manner.'
    };

    const platformContext = {
      linkedin: 'This is a LinkedIn professional message.',
      whatsapp: 'This is a WhatsApp personal message.',
      gmail: 'This is a professional email.',
      twitter: 'This is a Twitter/X direct message.'
    };

    return `You are ReplyGenius AI, an AI assistant that helps write smart replies.
${toneInstructions[tone] || toneInstructions.professional}
${platformContext[platform] || ''}
Generate 3-5 varied reply suggestions. Format each as a complete, ready-to-send message.
Keep replies concise and contextually appropriate.`;
  }

  /**
   * Parse AI response into multiple replies
   */
  _parseReplies(content) {
    let replies = content
      .split(/\n(?=\d+\.|\*\*|\- )/)
      .map(r => r.replace(/^\d+\.\s*|\*\*\d+\.\*\*|\*\*|\-/g, '').trim())
      .filter(r => r.length > 10 && r.length < 500);

    if (replies.length === 0) {
      replies = [content.trim()];
    }

    return replies.slice(0, 5);
  }

  /**
   * Handle streaming response
   */
  async _handleStreamResponse(stream) {
    const chunks = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              resolve({
                chunks,
                provider: this.name,
                model: 'streaming'
              });
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                chunks.push(content);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      });

      stream.on('error', reject);
      stream.on('end', () => {
        resolve({
          chunks,
          provider: this.name,
          model: 'streaming'
        });
      });
    });
  }

  /**
   * Validate API key
   */
  async validateKey() {
    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      logger.error('OpenRouter key validation failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new OpenRouterProvider();
module.exports.OpenRouterProvider = OpenRouterProvider;

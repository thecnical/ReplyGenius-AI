/**
 * ReplyGenius AI V2 - OpenRouter Provider Adapter
 * FALLBACK AI provider with enhanced context, personality, and memory support
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
   * Generate reply using OpenRouter API (V2 with context, personality, memory)
   */
  async generateReply(messages, options = {}) {
    const {
      model = this.models.balanced,
      tone = 'professional',
      platform = 'linkedin',
      stream = false,
      contextAnalysis = null,
      personalityPrompt = null,
      templateContent = null,
      userStyle = null
    } = options;

    const systemPrompt = this._buildSystemPromptV2(tone, platform, contextAnalysis, personalityPrompt, templateContent, userStyle);

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

    logger.info(`[FALLBACK] Generating reply with OpenRouter: ${model}`);

    return this.withRetry(async () => {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        requestBody,
        {
          headers: this.getHeaders({
            'HTTP-Referer': 'https://replygenius.ai',
            'X-Title': 'ReplyGenius AI V2'
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
   * Build enhanced V2 system prompt
   */
  _buildSystemPromptV2(tone, platform, contextAnalysis, personalityPrompt, templateContent, userStyle) {
    const parts = [];

    parts.push('You are ReplyGenius AI V2, an advanced AI communication assistant that generates smart, context-aware replies.');

    // Personality override
    if (personalityPrompt?.systemPrompt) {
      parts.push(`\n[AI Personality: ${personalityPrompt.name}]\n${personalityPrompt.systemPrompt}`);
    } else {
      parts.push(this._getToneInstruction(tone));
    }

    parts.push(this._getPlatformInstruction(platform));

    // Context analysis
    if (contextAnalysis) {
      const ctxParts = [
        `\n[Conversation Analysis]`,
        `- Detected intent: ${contextAnalysis.intent}`,
        `- Detected emotion: ${contextAnalysis.emotion}`,
        `- Urgency level: ${contextAnalysis.urgency}`,
        `- Formality: ${contextAnalysis.formality}`
      ];

      if (contextAnalysis.topics?.length > 0) {
        ctxParts.push(`- Topics: ${contextAnalysis.topics.join(', ')}`);
      }

      if (contextAnalysis.emotion === 'angry' || contextAnalysis.emotion === 'frustrated') {
        ctxParts.push(`\n⚠️ The sender appears ${contextAnalysis.emotion}. Respond with empathy, acknowledge their concern, and offer constructive help. Stay calm and professional.`);
      } else if (contextAnalysis.emotion === 'excited') {
        ctxParts.push(`\nThe sender is excited! Match their positive energy while keeping the response helpful.`);
      } else if (contextAnalysis.emotion === 'sad') {
        ctxParts.push(`\nThe sender seems down. Be empathetic, supportive, and understanding.`);
      }

      parts.push(ctxParts.join('\n'));
    }

    if (templateContent) {
      parts.push(`\n[Template Base]\nUse this template as a starting point, customizing it based on the conversation context:\n${templateContent}`);
    }

    if (userStyle) {
      parts.push(userStyle);
    }

    parts.push(
      '\nGenerate 3-5 varied reply suggestions. Format each as a complete, ready-to-send message.',
      'Keep replies concise and contextually appropriate.'
    );

    if (personalityPrompt?.formatting?.maxLength) {
      parts.push(`Keep each reply under ${personalityPrompt.formatting.maxLength} characters.`);
    }

    return parts.join('\n');
  }

  _getToneInstruction(tone) {
    const toneInstructions = {
      professional: 'Write in a professional, business-appropriate manner.',
      casual: 'Write in a casual, friendly conversational tone.',
      friendly: 'Write in a warm, friendly, approachable manner.',
      funny: 'Add subtle humor while remaining appropriate.',
      flirty: 'Add a subtle, tasteful flirty undertone.',
      formal: 'Write in a formal, polished, official manner.'
    };
    return toneInstructions[tone] || toneInstructions.professional;
  }

  _getPlatformInstruction(platform) {
    const platformContext = {
      linkedin: 'This is a LinkedIn professional message. Keep it networking-appropriate.',
      whatsapp: 'This is a WhatsApp personal message. Keep it conversational.',
      gmail: 'This is a professional email. Use proper email format.',
      twitter: 'This is a Twitter/X message. Be concise (280 char limit for tweets).',
      instagram: 'This is an Instagram DM. Keep it casual and visual.',
      telegram: 'This is a Telegram message. Conversational but can be longer.',
      general: 'Adapt your response to be universally appropriate.'
    };
    return platformContext[platform] || platformContext.general;
  }

  /**
   * Parse AI response into multiple replies
   */
  _parseReplies(content) {
    let replies = content
      .split(/\n(?=\d+\.|\*\*|- )/)
      .map(r => r.replaceAll(/(?:^\d+\.\s*|\*\*\d+\.\*\*|\*\*|-)/g, '').trim())
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
            } catch (_parseError) {
              // Skip invalid JSON chunks during SSE streaming
              logger.debug(`Skipped invalid SSE chunk: ${_parseError.message}`);
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

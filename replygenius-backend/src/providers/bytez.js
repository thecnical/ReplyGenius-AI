/**
 * ReplyGenius AI - Bytez AI Provider Adapter
 * Fallback provider with open-source models
 */

const axios = require('axios');
const BaseProvider = require('./base-provider');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('BytezProvider');

class BytezProvider extends BaseProvider {
  constructor() {
    super({
      name: 'Bytez AI',
      apiKey: config.providers.bytez.apiKey,
      baseUrl: config.providers.bytez.baseUrl,
      timeout: config.providers.bytez.timeout,
      maxRetries: config.providers.bytez.maxRetries,
      models: config.providers.bytez.models
    });
  }

  /**
   * Generate reply using Bytez AI API
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
      messages: formattedMessages,
      stream: stream || false,
      params: {
        temperature: 0.7,
        max_length: 500,
        top_p: 0.9
      }
    };

    logger.info(`Generating reply with Bytez AI: ${model}`);

    return this.withRetry(async () => {
      const response = await axios.post(
        `${this.baseUrl}/${model}`,
        requestBody,
        {
          headers: this.getHeaders(),
          timeout: this.timeout
        }
      );

      if (response.data.error) {
        const error = new Error(response.data.error);
        error.code = response.data.error.includes('rate') ? 'RATE_LIMIT' : 'PROVIDER_ERROR';
        throw error;
      }

      const content = response.data.output || response.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Invalid response from Bytez AI');
      }

      return {
        replies: this._parseReplies(content),
        provider: this.name,
        model: model,
        usage: response.data.usage
      };
    });
  }

  /**
   * Build system prompt
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
   * Validate API key
   */
  async validateKey() {
    try {
      const response = await axios.get(`${this.baseUrl.replace('/models/v2', '')}/models/v2/list/models?task=chat`, {
        headers: { Authorization: this.apiKey },
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      logger.error('Bytez key validation failed:', error.message);
      return false;
    }
  }

  /**
   * Get list of available models
   */
  async getModels() {
    try {
      const response = await axios.get(`${this.baseUrl}/list/models?task=chat`, {
        headers: { Authorization: this.apiKey },
        timeout: 5000
      });
      return response.data.output || [];
    } catch (error) {
      logger.error('Failed to get Bytez models:', error.message);
      return [];
    }
  }
}

// Export singleton instance
module.exports = new BytezProvider();
module.exports.BytezProvider = BytezProvider;

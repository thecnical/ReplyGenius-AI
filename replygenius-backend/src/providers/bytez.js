/**
 * ReplyGenius AI V2 - Bytez AI Provider Adapter
 * PRIMARY provider with enhanced context, personality, and memory support
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
   * Generate reply using Bytez AI API (V2 with context, personality, memory)
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
      messages: formattedMessages,
      stream: stream || false,
      params: {
        temperature: 0.7,
        max_length: 500,
        top_p: 0.9
      }
    };

    logger.info(`[PRIMARY] Generating reply with Bytez AI: ${model}`);

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
   * Build enhanced V2 system prompt with context, personality, and memory
   */
  _buildSystemPromptV2(tone, platform, contextAnalysis, personalityPrompt, templateContent, userStyle) {
    const parts = [];

    // Base identity
    parts.push('You are ReplyGenius AI V2, an advanced AI communication assistant that generates smart, context-aware replies.');

    // Personality override (takes priority)
    if (personalityPrompt?.systemPrompt) {
      parts.push(`\n[AI Personality: ${personalityPrompt.name}]\n${personalityPrompt.systemPrompt}`);
    } else {
      // Default tone instructions
      parts.push(this._getToneInstruction(tone));
    }

    // Platform context
    parts.push(this._getPlatformInstruction(platform));

    // Context analysis insights (V2)
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

      // Emotion-specific instructions
      if (contextAnalysis.emotion === 'angry' || contextAnalysis.emotion === 'frustrated') {
        ctxParts.push(`\n⚠️ The sender appears ${contextAnalysis.emotion}. Respond with empathy, acknowledge their concern, and offer constructive help. Stay calm and professional.`);
      } else if (contextAnalysis.emotion === 'excited') {
        ctxParts.push(`\nThe sender is excited! Match their positive energy while keeping the response helpful.`);
      } else if (contextAnalysis.emotion === 'sad') {
        ctxParts.push(`\nThe sender seems down. Be empathetic, supportive, and understanding.`);
      }

      parts.push(ctxParts.join('\n'));
    }

    // Template base (V2)
    if (templateContent) {
      parts.push(`\n[Template Base]\nUse this template as a starting point, customizing it based on the conversation context:\n${templateContent}`);
    }

    // User style preferences (V2 Memory)
    if (userStyle) {
      parts.push(userStyle);
    }

    // Output instructions
    parts.push(
      '\nGenerate 3-5 varied reply suggestions. Format each as a complete, ready-to-send message.',
      'Keep replies concise and contextually appropriate.'
    );

    if (personalityPrompt?.formatting?.maxLength) {
      parts.push(`Keep each reply under ${personalityPrompt.formatting.maxLength} characters.`);
    }

    return parts.join('\n');
  }

  /**
   * Get tone instruction
   */
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

  /**
   * Get platform instruction
   */
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

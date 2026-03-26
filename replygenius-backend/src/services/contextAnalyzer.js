/**
 * ReplyGenius AI V2 - Context Analyzer Service
 * Analyzes conversation context for intent, emotion, and platform-specific insights
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('ContextAnalyzer');

class ContextAnalyzer {
  constructor() {
    // Emotion keyword patterns
    this.emotionPatterns = {
      angry: {
        keywords: ['angry', 'furious', 'annoyed', 'frustrated', 'terrible', 'worst', 'hate', 'unacceptable', 'ridiculous', 'pathetic', 'disgusted', 'outraged', 'fed up', 'sick of', 'done with'],
        indicators: ['!!!', 'WTF', 'SMH', 'CAPS_HEAVY']
      },
      frustrated: {
        keywords: ['not working', 'broken', 'issue', 'problem', 'stuck', 'help', "can't", "won't", 'failing', 'error', 'bug', 'disappointed', 'waiting', 'still', 'again'],
        indicators: ['...', '?!']
      },
      friendly: {
        keywords: ['thanks', 'appreciate', 'great', 'awesome', 'love', 'wonderful', 'amazing', 'fantastic', 'excellent', 'happy', 'glad', 'nice', 'cool', 'perfect', 'cheers', 'hey'],
        indicators: ['😊', '😄', '👍', '❤️', '🙏', ':)', '🎉']
      },
      neutral: {
        keywords: ['okay', 'fine', 'sure', 'alright', 'noted', 'understood', 'got it', 'will do', 'ack'],
        indicators: []
      },
      excited: {
        keywords: ['excited', 'can\'t wait', 'thrilled', 'looking forward', 'pumped', 'stoked', 'yay', 'woohoo', 'congrats', 'celebrate'],
        indicators: ['!!!', '🎉', '🔥', '🚀', '💪']
      },
      sad: {
        keywords: ['sorry', 'unfortunately', 'sad', 'regret', 'miss', 'lost', 'passed away', 'condolences', 'grieving', 'heartbreaking'],
        indicators: ['😢', '😞', '💔']
      }
    };

    // Intent patterns
    this.intentPatterns = {
      question: {
        patterns: [/^(what|who|where|when|why|how|is|are|do|does|did|can|could|would|will|should)/i, /\?$/],
        keywords: ['wondering', 'asking', 'curious', 'any idea', 'do you know', 'tell me']
      },
      request: {
        patterns: [/^(please|could you|can you|would you|i need|i want|send me|share)/i],
        keywords: ['need', 'want', 'require', 'request', 'looking for', 'seeking', 'interested in']
      },
      complaint: {
        patterns: [/^(i am not|this is not|this doesn't|why isn't|why can't)/i],
        keywords: ['complain', 'issue', 'problem', 'unsatisfied', 'poor', 'bad experience', 'refund', 'escalate']
      },
      greeting: {
        patterns: [/^(hi|hello|hey|good morning|good afternoon|good evening|dear|howdy)/i],
        keywords: ['nice to meet', 'pleased to', 'greetings', 'hope you']
      },
      information: {
        patterns: [/^(fyi|just to let you know|update|heads up|wanted to inform)/i],
        keywords: ['inform', 'update', 'let you know', 'share', 'announce', 'notice']
      },
      gratitude: {
        patterns: [/^(thank|thanks|appreciate|grateful)/i],
        keywords: ['thank you', 'thanks a lot', 'much appreciated', 'grateful for']
      },
      apology: {
        patterns: [/^(sorry|apolog|my bad|pardon)/i],
        keywords: ['sorry', 'apologize', 'my mistake', 'forgive']
      }
    };

    // Tone-to-emotion mapping for auto-tone suggestions
    this.emotionToneMap = {
      angry: 'professional',      // Calm + polite for angry users
      frustrated: 'friendly',     // Warm + helpful for frustrated users
      friendly: 'casual',         // Match the casual vibe
      neutral: 'professional',    // Default professional
      excited: 'friendly',        // Match the energy
      sad: 'friendly'             // Empathetic + warm
    };

    logger.info('Context Analyzer initialized');
  }

  /**
   * Analyze full conversation for context
   * @param {Array} messages - Array of { role, content } messages
   * @param {string} platform - Platform identifier
   * @returns {Object} Analysis result
   */
  analyzeConversation(messages, platform = 'general') {
    if (!messages || messages.length === 0) {
      return this._defaultAnalysis(platform);
    }

    // Get the last 10-15 messages for context
    const recentMessages = messages.slice(-15);
    const allText = recentMessages.map(m => m.content).join(' ');
    const lastMessage = recentMessages.at(-1)?.content || '';

    // Analyze components
    const intent = this._detectIntent(lastMessage, allText);
    const emotion = this._detectEmotion(lastMessage, allText);
    const urgency = this._detectUrgency(lastMessage, allText);
    const formality = this._detectFormality(lastMessage, platform);
    const topics = this._extractTopics(allText);
    const suggestedTone = this._suggestTone(emotion, intent, platform, formality);
    const platformContext = this._getPlatformContext(platform);

    return {
      intent,
      emotion,
      urgency,
      formality,
      topics,
      suggestedTone,
      platformContext,
      messageCount: recentMessages.length,
      conversationLength: allText.length,
      analysisVersion: '2.0'
    };
  }

  /**
   * Detect the primary intent of the message
   */
  _detectIntent(lastMessage, allText) {
    const scores = {};

    for (const [intent, config] of Object.entries(this.intentPatterns)) {
      let score = 0;

      // Check regex patterns
      for (const pattern of config.patterns) {
        if (pattern.test(lastMessage)) score += 3;
      }

      // Check keywords
      const lowerText = lastMessage.toLowerCase();
      for (const keyword of config.keywords) {
        if (lowerText.includes(keyword)) score += 2;
      }

      scores[intent] = score;
    }

    // Find highest-scoring intent
    const entries = Object.entries(scores);
    if (entries.length === 0) return 'information';
    const maxIntent = entries.reduce((a, b) => a[1] > b[1] ? a : b, entries[0]);
    return maxIntent[1] > 0 ? maxIntent[0] : 'information';
  }

  /**
   * Detect the emotional tone of the conversation
   */
  _detectEmotion(lastMessage, _allText) {
    const scores = {};
    const text = lastMessage.toLowerCase();

    for (const [emotion, config] of Object.entries(this.emotionPatterns)) {
      scores[emotion] = this._scoreEmotion(emotion, config, text, lastMessage);
    }

    const emotionEntries = Object.entries(scores);
    if (emotionEntries.length === 0) return 'neutral';
    const maxEmotion = emotionEntries.reduce((a, b) => a[1] > b[1] ? a : b, emotionEntries[0]);
    return maxEmotion[1] > 0 ? maxEmotion[0] : 'neutral';
  }

  /**
   * Score a single emotion
   * @private
   */
  _scoreEmotion(emotion, config, lowerText, originalText) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (lowerText.includes(keyword)) score += 2;
    }
    for (const indicator of config.indicators) {
      if (originalText.includes(indicator)) score += 1;
    }
    if (emotion === 'angry') {
      const capsRatio = (originalText.match(/[A-Z]/g) || []).length / Math.max(originalText.length, 1);
      if (capsRatio > 0.6 && originalText.length > 10) score += 3;
    }
    return score;
  }

  /**
   * Detect urgency level
   */
  _detectUrgency(lastMessage, allText) {
    const urgentKeywords = ['urgent', 'asap', 'immediately', 'right now', 'emergency', 'critical', 'deadline', 'today', 'need this now'];
    const text = lastMessage.toLowerCase();

    let score = 0;
    for (const keyword of urgentKeywords) {
      if (text.includes(keyword)) score++;
    }

    if (lastMessage.includes('!!!')) score += 2;
    if (lastMessage.toUpperCase() === lastMessage && lastMessage.length > 20) score++;

    if (score >= 3) return 'high';
    if (score >= 1) return 'medium';
    return 'low';
  }

  /**
   * Detect formality level
   */
  _detectFormality(text, platform) {
    const formalIndicators = ['dear', 'sincerely', 'regards', 'respectfully', 'kindly', 'please find', 'pursuant', 'herewith'];
    const informalIndicators = ['hey', 'yo', 'lol', 'omg', 'bruh', 'nah', 'gonna', 'wanna', 'gotta', 'haha', 'lmao'];

    const lower = text.toLowerCase();
    let formalScore = 0;
    let informalScore = 0;

    for (const word of formalIndicators) { if (lower.includes(word)) formalScore++; }
    for (const word of informalIndicators) { if (lower.includes(word)) informalScore++; }

    // Platform hints
    if (platform === 'linkedin' || platform === 'gmail') formalScore += 1;
    if (platform === 'whatsapp' || platform === 'instagram' || platform === 'telegram') informalScore += 1;

    if (formalScore > informalScore) return 'formal';
    if (informalScore > formalScore) return 'informal';
    return 'neutral';
  }

  /**
   * Extract key topics from conversation
   */
  _extractTopics(text) {
    const topicCategories = {
      business: ['meeting', 'project', 'deadline', 'deliverable', 'client', 'revenue', 'budget', 'strategy', 'proposal'],
      technical: ['code', 'bug', 'deploy', 'server', 'database', 'api', 'feature', 'release', 'update'],
      hr: ['interview', 'position', 'role', 'hiring', 'resume', 'salary', 'offer', 'team', 'onboard'],
      sales: ['deal', 'pricing', 'demo', 'trial', 'subscription', 'discount', 'offer', 'contract'],
      support: ['issue', 'problem', 'help', 'fix', 'broken', 'not working', 'ticket', 'resolution'],
      social: ['party', 'weekend', 'vacation', 'movie', 'game', 'dinner', 'birthday', 'hang out']
    };

    const lower = text.toLowerCase();
    const detected = [];

    for (const [topic, keywords] of Object.entries(topicCategories)) {
      const matches = keywords.filter(k => lower.includes(k));
      if (matches.length >= 2) detected.push(topic);
    }

    return detected.length > 0 ? detected : ['general'];
  }

  /**
   * Suggest optimal tone based on analysis
   */
  _suggestTone(emotion, intent, platform, formality) {
    // Priority 1: Emotion-based override
    if (emotion === 'angry' || emotion === 'frustrated') {
      return 'professional'; // Always calm + polite for upset users
    }

    // Priority 2: Platform-specific defaults
    const platformTones = {
      linkedin: 'professional',
      gmail: 'professional',
      whatsapp: 'casual',
      twitter: 'casual',
      instagram: 'casual',
      telegram: 'casual'
    };

    // Priority 3: Formality-based
    if (formality === 'formal') return 'formal';
    if (formality === 'informal') return 'casual';

    return platformTones[platform] || 'professional';
  }

  /**
   * Get platform-specific context information
   */
  _getPlatformContext(platform) {
    const contexts = {
      linkedin: {
        name: 'LinkedIn',
        type: 'professional_network',
        maxLength: 3000,
        formatting: 'Keep it professional. Use proper grammar. Avoid emojis in formal contexts.',
        hints: 'Consider networking etiquette. Be concise but thorough.'
      },
      whatsapp: {
        name: 'WhatsApp',
        type: 'messaging',
        maxLength: 1000,
        formatting: 'Keep messages short and conversational. Emojis are acceptable.',
        hints: 'Match the casual tone of instant messaging.'
      },
      gmail: {
        name: 'Gmail',
        type: 'email',
        maxLength: 5000,
        formatting: 'Use proper email format with greeting and sign-off. Professional formatting.',
        hints: 'Include appropriate salutation and closing.'
      },
      twitter: {
        name: 'Twitter/X',
        type: 'microblogging',
        maxLength: 280,
        formatting: 'Be concise. Use hashtags sparingly. Direct and punchy.',
        hints: 'Character limit is critical. Be impactful in few words.'
      },
      instagram: {
        name: 'Instagram',
        type: 'social_media',
        maxLength: 2200,
        formatting: 'Casual and visual. Emojis welcome. Hashtags optional.',
        hints: 'Match the creative, visual platform style.'
      },
      telegram: {
        name: 'Telegram',
        type: 'messaging',
        maxLength: 4096,
        formatting: 'Similar to WhatsApp but supports longer messages. Markdown supported.',
        hints: 'Can be more detailed than WhatsApp. Formatting is a plus.'
      },
      general: {
        name: 'General',
        type: 'general',
        maxLength: 2000,
        formatting: 'Adapt to context. Default to professional tone.',
        hints: 'Be versatile and context-appropriate.'
      }
    };

    return contexts[platform] || contexts.general;
  }

  /**
   * Default analysis when no messages provided
   */
  _defaultAnalysis(platform) {
    return {
      intent: 'information',
      emotion: 'neutral',
      urgency: 'low',
      formality: 'neutral',
      topics: ['general'],
      suggestedTone: 'professional',
      platformContext: this._getPlatformContext(platform),
      messageCount: 0,
      conversationLength: 0,
      analysisVersion: '2.0'
    };
  }
}

module.exports = new ContextAnalyzer();

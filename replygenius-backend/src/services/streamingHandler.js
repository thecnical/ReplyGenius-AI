/**
 * ReplyGenius AI - Streaming Handler
 * Server-Sent Events (SSE) for real-time AI responses
 */

const { createLogger } = require('../utils/logger');

const logger = createLogger('StreamingHandler');

class StreamingHandler {
  constructor() {
    this.clients = new Map();
    this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
  }

  /**
   * Add a new SSE client connection
   */
  addClient(userId, res) {
    const clientId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });

    this._sendEvent(res, 'connected', { 
      clientId, 
      timestamp: Date.now() 
    });

    this.clients.set(clientId, { 
      userId, 
      res, 
      connectedAt: Date.now(),
      lastActivity: Date.now()
    });

    logger.info(`SSE client connected: ${clientId}`);
    
    res.on('close', () => {
      this.clients.delete(clientId);
      logger.info(`SSE client disconnected: ${clientId}`);
    });

    return clientId;
  }

  /**
   * Send SSE event to client
   */
  _sendEvent(res, event, data) {
    try {
      const payload = JSON.stringify(data);
      res.write(`event: ${event}\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (error) {
      logger.error('SSE send error:', error.message);
    }
  }

  /**
   * Stream AI response chunks to client
   */
  async streamResponse(clientId, chunks, onComplete) {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn(`Client not found for streaming: ${clientId}`);
      return;
    }

    const { res } = client;
    let fullContent = '';

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        fullContent += chunk;
        
        this._sendEvent(res, 'chunk', { 
          chunkIndex: i,
          content: chunk,
          accumulated: fullContent,
          progress: Math.round(((i + 1) / chunks.length) * 100)
        });

        if (i < chunks.length - 1) {
          await this._sleep(50);
        }
      }

      this._sendEvent(res, 'complete', { 
        fullContent,
        totalChunks: chunks.length,
        timestamp: Date.now() 
      });

      client.lastActivity = Date.now();

      if (onComplete) {
        await onComplete(fullContent);
      }

      logger.debug(`Streaming complete for client: ${clientId}`);

    } catch (error) {
      logger.error('Streaming error:', error.message);
      this._sendEvent(res, 'error', { message: error.message });
    }
  }

  /**
   * Stream response word by word
   */
  async streamText(clientId, content, onComplete) {
    const words = content.split(/(\s+)/);
    const chunks = [];
    
    for (let i = 0; i < words.length; i += 2) {
      const chunk = words.slice(i, i + 3).join('');
      if (chunk.trim()) chunks.push(chunk);
    }

    return this.streamResponse(clientId, chunks, onComplete);
  }

  /**
   * Send progress update to client
   */
  sendProgress(clientId, progress) {
    const client = this.clients.get(clientId);
    if (client) {
      this._sendEvent(client.res, 'progress', progress);
      client.lastActivity = Date.now();
    }
  }

  /**
   * Broadcast event to all clients for a user
   */
  broadcastToUser(userId, event, data) {
    let count = 0;
    this.clients.forEach((client, clientId) => {
      if (client.userId === userId) {
        this._sendEvent(client.res, event, data);
        count++;
      }
    });
    return count;
  }

  /**
   * Send error to specific client
   */
  sendError(clientId, message) {
    const client = this.clients.get(clientId);
    if (client) {
      this._sendEvent(client.res, 'error', { message });
    }
  }

  /**
   * Get active connection count
   */
  getActiveCount() {
    return this.clients.size;
  }

  /**
   * Get client info by clientId
   */
  getClient(clientId) {
    return this.clients.get(clientId);
  }

  /**
   * Cleanup stale connections
   */
  _cleanup() {
    const now = Date.now();
    const maxAge = 300000;
    let cleaned = 0;

    this.clients.forEach((client, clientId) => {
      if (now - client.lastActivity > maxAge) {
        client.res.end();
        this.clients.delete(clientId);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} stale SSE connections`);
    }
  }

  /**
   * Promise-based sleep helper
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.clients.forEach((client) => {
      client.res.end();
    });
    this.clients.clear();
  }
}

module.exports = new StreamingHandler();

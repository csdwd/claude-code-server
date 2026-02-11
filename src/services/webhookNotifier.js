const axios = require('axios');
const getLogger = require('../utils/logger');

/**
 * Webhook 通知器
 */
class WebhookNotifier {
  constructor(config) {
    this.config = config;
    this.logger = getLogger({ logFile: config.logFile, logLevel: config.logLevel });
    this.enabled = config.webhook?.enabled || false;
    this.defaultUrl = config.webhook?.defaultUrl;
    this.timeout = config.webhook?.timeout || 5000;
    this.maxRetries = config.webhook?.retries || 3;
  }

  /**
   * 发送 webhook 通知
   */
  async notify(event, data, options = {}) {
    if (!this.enabled) {
      this.logger.debug('Webhook is disabled, skipping notification');
      return { success: false, reason: 'disabled' };
    }

    const url = options.url || this.defaultUrl;
    if (!url) {
      this.logger.warn('No webhook URL configured');
      return { success: false, reason: 'no_url' };
    }

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    let lastError = null;

    // 重试机制
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info(`Sending webhook notification`, {
          url,
          event,
          attempt,
          maxRetries: this.maxRetries,
        });

        const response = await axios.post(url, payload, {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Claude-API-Server/1.0',
          },
        });

        if (response.status >= 200 && response.status < 300) {
          this.logger.info(`Webhook notification succeeded`, {
            url,
            event,
            status: response.status,
            attempt,
          });

          return {
            success: true,
            status: response.status,
            attempt,
          };
        } else {
          lastError = `Unexpected status code: ${response.status}`;
          this.logger.warn(`Webhook returned non-2xx status`, {
            url,
            event,
            status: response.status,
            attempt,
          });
        }
      } catch (error) {
        lastError = error.message;
        this.logger.warn(`Webhook notification failed`, {
          url,
          event,
          error: error.message,
          attempt,
        });

        // 最后一次尝试失败，不再等待
        if (attempt < this.maxRetries) {
          // 指数退避
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有尝试都失败
    this.logger.error(`Webhook notification failed after ${this.maxRetries} attempts`, {
      url,
      event,
      lastError,
    });

    return {
      success: false,
      reason: 'max_retries_exceeded',
      attempts: this.maxRetries,
      last_error: lastError,
    };
  }

  /**
   * 任务完成通知
   */
  async notifyTaskCompleted(taskId, result) {
    return await this.notify('task.completed', {
      task_id: taskId,
      status: 'completed',
      result,
    });
  }

  /**
   * 任务失败通知
   */
  async notifyTaskFailed(taskId, error) {
    return await this.notify('task.failed', {
      task_id: taskId,
      status: 'failed',
      error,
    });
  }

  /**
   * 任务取消通知
   */
  async notifyTaskCancelled(taskId) {
    return await this.notify('task.cancelled', {
      task_id: taskId,
      status: 'cancelled',
    });
  }

  /**
   * 会话创建通知
   */
  async notifySessionCreated(sessionId, sessionData) {
    return await this.notify('session.created', {
      session_id: sessionId,
      ...sessionData,
    });
  }

  /**
   * 会话删除通知
   */
  async notifySessionDeleted(sessionId) {
    return await this.notify('session.deleted', {
      session_id: sessionId,
    });
  }

  /**
   * 自定义通知
   */
  async sendCustomNotification(event, data, url) {
    return await this.notify(event, data, { url });
  }
}

module.exports = WebhookNotifier;

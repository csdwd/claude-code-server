const SessionStore = require('../storage/sessionStore');
const ClaudeExecutor = require('./claudeExecutor');
const getLogger = require('../utils/logger');

/**
 * 会话管理服务
 */
class SessionManager {
  constructor(config, sessionStore, claudeExecutor) {
    this.config = config;
    this.sessionStore = sessionStore;
    this.claudeExecutor = claudeExecutor;
    this.logger = getLogger({ logFile: config.logFile, logLevel: config.logLevel });
  }

  /**
   * 创建新会话
   */
  async createSession(sessionData) {
    const session = await this.sessionStore.create(sessionData);
    this.logger.info(`Session created`, { session_id: session.id, project_path: session.project_path });
    return session;
  }

  /**
   * 获取会话详情
   */
  async getSession(sessionId) {
    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      return null;
    }
    return session;
  }

  /**
   * 继续会话对话
   */
  async continueSession(sessionId, options) {
    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      };
    }

    // 检查会话状态
    if (session.status !== 'active') {
      return {
        success: false,
        error: `Session is not active: ${session.status}`,
      };
    }

    // 使用会话的配置执行 Claude
    const result = await this.claudeExecutor.execute({
      prompt: options.prompt,
      projectPath: session.project_path,
      model: options.model || session.model,
      sessionId: session.id,
      systemPrompt: options.systemPrompt,
      maxBudgetUsd: options.maxBudgetUsd,
      stream: options.stream,
    });

    return result;
  }

  /**
   * 列出会话
   */
  async listSessions(options = {}) {
    const sessions = await this.sessionStore.list(options);
    return sessions;
  }

  /**
   * 搜索会话
   */
  async searchSessions(query, options = {}) {
    const sessions = await this.sessionStore.search(query, options);
    return sessions;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId) {
    const deleted = await this.sessionStore.delete(sessionId);
    if (deleted) {
      this.logger.info(`Session deleted`, { session_id: sessionId });
      return { success: true };
    }
    return { success: false, error: 'Session not found' };
  }

  /**
   * 更新会话状态
   */
  async updateSessionStatus(sessionId, status) {
    const session = await this.sessionStore.update(sessionId, { status });
    if (session) {
      this.logger.info(`Session status updated`, { session_id: sessionId, status });
      return { success: true, session };
    }
    return { success: false, error: 'Session not found' };
  }

  /**
   * 获取会话统计
   */
  async getSessionStats(sessionId) {
    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      created_at: session.created_at,
      updated_at: session.updated_at,
      messages_count: session.messages_count,
      total_cost_usd: session.total_cost_usd,
      model: session.model,
      project_path: session.project_path,
      status: session.status,
    };
  }

  /**
   * 清理过期会话
   */
  async cleanupExpiredSessions() {
    const retentionDays = this.config.sessionRetentionDays || 30;
    const result = await this.sessionStore.cleanup(retentionDays);
    this.logger.info(`Expired sessions cleaned up`, { deleted_count: result.deletedCount });
    return result;
  }
}

module.exports = SessionManager;

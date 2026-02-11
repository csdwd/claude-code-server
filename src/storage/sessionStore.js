const BaseStore = require('./baseStore');

/**
 * 会话存储
 */
class SessionStore extends BaseStore {
  constructor(dataDir = './data/sessions') {
    super(dataDir, 'sessions.json');
  }

  /**
   * 获取默认数据结构
   */
  getDefaultData() {
    return { sessions: [] };
  }

  /**
   * 创建会话
   */
  async create(sessionData) {
    return this.withLock(async () => {
      const session = {
        id: this.generateId(),
        created_at: this.now(),
        updated_at: this.now(),
        model: sessionData.model || 'claude-sonnet-4-5',
        project_path: sessionData.project_path,
        total_cost_usd: 0,
        messages_count: 0,
        status: 'active',
        metadata: sessionData.metadata || {},
      };

      this.db.data.sessions.push(session);
      return session;
    });
  }

  /**
   * 获取会话
   */
  async get(sessionId) {
    await this.db.read();
    return this.db.data.sessions.find(s => s.id === sessionId);
  }

  /**
   * 更新会话
   */
  async update(sessionId, updates) {
    return this.withLock(async () => {
      const index = this.db.data.sessions.findIndex(s => s.id === sessionId);
      if (index === -1) {
        return null;
      }

      // 合并更新
      this.db.data.sessions[index] = {
        ...this.db.data.sessions[index],
        ...updates,
        updated_at: this.now(),
      };

      return this.db.data.sessions[index];
    });
  }

  /**
   * 删除会话
   */
  async delete(sessionId) {
    return this.withLock(async () => {
      const index = this.db.data.sessions.findIndex(s => s.id === sessionId);
      if (index === -1) {
        return false;
      }

      this.db.data.sessions.splice(index, 1);
      return true;
    });
  }

  /**
   * 列出所有会话
   */
  async list(options = {}) {
    await this.db.read();

    let sessions = this.db.data.sessions;

    // 过滤条件
    if (options.status) {
      sessions = sessions.filter(s => s.status === options.status);
    }

    if (options.project_path) {
      sessions = sessions.filter(s => s.project_path === options.project_path);
    }

    // 排序
    sessions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    // 分页
    if (options.limit) {
      sessions = sessions.slice(0, options.limit);
    }

    return sessions;
  }

  /**
   * 搜索会话
   */
  async search(query, options = {}) {
    await this.db.read();

    const lowerQuery = query.toLowerCase();
    let sessions = this.db.data.sessions.filter(s =>
      s.id.toLowerCase().includes(lowerQuery) ||
      (s.metadata && JSON.stringify(s.metadata).toLowerCase().includes(lowerQuery))
    );

    // 排序
    sessions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    // 分页
    if (options.limit) {
      sessions = sessions.slice(0, options.limit);
    }

    return sessions;
  }

  /**
   * 清理过期会话
   */
  async cleanup(retentionDays) {
    return this.withLock(async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const beforeCount = this.db.data.sessions.length;
      this.db.data.sessions = this.db.data.sessions.filter(
        s => new Date(s.updated_at) > cutoffDate
      );
      const deletedCount = beforeCount - this.db.data.sessions.length;

      return { deletedCount };
    });
  }

  /**
   * 增加消息计数
   */
  async incrementMessages(sessionId) {
    return this.withLock(async () => {
      const session = this.db.data.sessions.find(s => s.id === sessionId);
      if (!session) {
        return null;
      }

      session.messages_count = (session.messages_count || 0) + 1;
      session.updated_at = this.now();

      return session;
    });
  }

  /**
   * 增加花费
   */
  async addCost(sessionId, costUsd) {
    return this.withLock(async () => {
      const session = this.db.data.sessions.find(s => s.id === sessionId);
      if (!session) {
        return null;
      }

      session.total_cost_usd = (session.total_cost_usd || 0) + costUsd;
      session.updated_at = this.now();

      return session;
    });
  }
}

module.exports = SessionStore;

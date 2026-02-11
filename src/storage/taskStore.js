const BaseStore = require('./baseStore');

/**
 * 任务存储
 */
class TaskStore extends BaseStore {
  constructor(dataDir = './data/tasks') {
    super(dataDir, 'tasks.json');
  }

  /**
   * 获取默认数据结构
   */
  getDefaultData() {
    return { tasks: [] };
  }

  /**
   * 创建任务
   */
  async create(taskData) {
    return this.withLock(async () => {
      const task = {
        id: this.generateId(),
        created_at: this.now(),
        updated_at: this.now(),
        status: 'pending',
        prompt: taskData.prompt,
        project_path: taskData.project_path,
        model: taskData.model || 'claude-sonnet-4-5',
        priority: taskData.priority || 5,
        result: null,
        error: null,
        started_at: null,
        completed_at: null,
        duration_ms: null,
        cost_usd: 0,
        session_id: null,
        metadata: taskData.metadata || {},
      };

      this.db.data.tasks.push(task);
      return task;
    });
  }

  /**
   * 获取任务
   */
  async get(taskId) {
    await this.db.read();
    return this.db.data.tasks.find(t => t.id === taskId);
  }

  /**
   * 更新任务
   */
  async update(taskId, updates) {
    return this.withLock(async () => {
      const index = this.db.data.tasks.findIndex(t => t.id === taskId);
      if (index === -1) {
        return null;
      }

      // 合并更新
      this.db.data.tasks[index] = {
        ...this.db.data.tasks[index],
        ...updates,
        updated_at: this.now(),
      };

      return this.db.data.tasks[index];
    });
  }

  /**
   * 删除任务
   */
  async delete(taskId) {
    return this.withLock(async () => {
      const index = this.db.data.tasks.findIndex(t => t.id === taskId);
      if (index === -1) {
        return false;
      }

      this.db.data.tasks.splice(index, 1);
      return true;
    });
  }

  /**
   * 列出任务
   */
  async list(options = {}) {
    await this.db.read();

    let tasks = this.db.data.tasks;

    // 过滤条件
    if (options.status) {
      tasks = tasks.filter(t => t.status === options.status);
    }

    // 排序（按优先级和创建时间）
    tasks.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // 优先级高的在前
      }
      return new Date(a.created_at) - new Date(b.created_at);
    });

    // 分页
    if (options.limit) {
      tasks = tasks.slice(0, options.limit);
    }

    return tasks;
  }

  /**
   * 获取下一个待处理任务
   */
  async getNextPending() {
    await this.db.read();

    const pendingTasks = this.db.data.tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.created_at) - new Date(b.created_at);
      });

    return pendingTasks[0] || null;
  }

  /**
   * 标记任务为处理中
   */
  async markProcessing(taskId) {
    return this.update(taskId, {
      status: 'processing',
      started_at: this.now(),
    });
  }

  /**
   * 标记任务为完成
   */
  async markCompleted(taskId, result, costUsd = 0) {
    const task = await this.get(taskId);
    if (!task) {
      return null;
    }

    const duration = task.started_at
      ? Date.now() - new Date(task.started_at).getTime()
      : null;

    return this.update(taskId, {
      status: 'completed',
      completed_at: this.now(),
      result,
      cost_usd: costUsd,
      duration_ms: duration,
    });
  }

  /**
   * 标记任务为失败
   */
  async markFailed(taskId, error) {
    const task = await this.get(taskId);
    if (!task) {
      return null;
    }

    const duration = task.started_at
      ? Date.now() - new Date(task.started_at).getTime()
      : null;

    return this.update(taskId, {
      status: 'failed',
      completed_at: this.now(),
      error,
      duration_ms: duration,
    });
  }

  /**
   * 取消任务
   */
  async cancel(taskId) {
    const task = await this.get(taskId);
    if (!task) {
      return null;
    }

    // 只能取消 pending 或 processing 状态的任务
    if (task.status !== 'pending' && task.status !== 'processing') {
      return null;
    }

    return this.update(taskId, {
      status: 'cancelled',
      completed_at: this.now(),
    });
  }

  /**
   * 清理已完成的旧任务
   */
  async cleanup(retentionDays) {
    return this.withLock(async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const beforeCount = this.db.data.tasks.length;
      this.db.data.tasks = this.db.data.tasks.filter(
        t => new Date(t.completed_at || t.created_at) > cutoffDate ||
             (t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled')
      );
      const deletedCount = beforeCount - this.db.data.tasks.length;

      return { deletedCount };
    });
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    await this.db.read();

    const tasks = this.db.data.tasks;
    const stats = {
      total: tasks.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total_cost_usd: 0,
    };

    tasks.forEach(t => {
      stats[t.status]++;
      stats.total_cost_usd += t.cost_usd || 0;
    });

    return stats;
  }
}

module.exports = TaskStore;

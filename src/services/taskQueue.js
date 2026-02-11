const TaskStore = require('../storage/taskStore');
const ClaudeExecutor = require('./claudeExecutor');
const getLogger = require('../utils/logger');
const { EventEmitter } = require('events');

/**
 * 简单内存任务队列
 */
class TaskQueue extends EventEmitter {
  constructor(config, taskStore, claudeExecutor, webhookNotifier = null) {
    super();
    this.config = config;
    this.taskStore = taskStore;
    this.claudeExecutor = claudeExecutor;
    this.webhookNotifier = webhookNotifier;
    this.logger = getLogger({ logFile: config.logFile, logLevel: config.logLevel });

    // 队列配置
    this.concurrency = config.taskQueue?.concurrency || 3;
    this.defaultTimeout = config.taskQueue?.defaultTimeout || 300000;

    // 运行状态
    this.running = false;
    this.activeTasks = new Map(); // taskId -> { promise, timeout }
    this.pendingCheckInterval = null;
  }

  /**
   * 启动队列
   */
  async start() {
    if (this.running) {
      this.logger.warn('Task queue is already running');
      return;
    }

    this.running = true;

    // 恢复之前未完成的任务
    await this.restorePendingTasks();

    // 启动处理循环
    this.processQueue();

    // 定期检查新任务
    this.pendingCheckInterval = setInterval(() => {
      this.processQueue();
    }, 1000);

    this.logger.info('Task queue started', { concurrency: this.concurrency });
  }

  /**
   * 停止队列
   */
  async stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    // 停止检查定时器
    if (this.pendingCheckInterval) {
      clearInterval(this.pendingCheckInterval);
      this.pendingCheckInterval = null;
    }

    // 等待活跃任务完成（最多等待 10 秒）
    const timeout = setTimeout(() => {
      if (this.activeTasks.size > 0) {
        this.logger.warn('Forcing shutdown with active tasks', {
          count: this.activeTasks.size,
        });
      }
    }, 10000);

    while (this.activeTasks.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    clearTimeout(timeout);

    this.logger.info('Task queue stopped');
  }

  /**
   * 添加任务到队列
   */
  async addTask(taskData) {
    const task = await this.taskStore.create(taskData);
    this.logger.info('Task added to queue', {
      task_id: task.id,
      priority: task.priority,
    });

    // 触发处理
    setImmediate(() => this.processQueue());

    return task;
  }

  /**
   * 处理队列
   */
  async processQueue() {
    if (!this.running) {
      return;
    }

    // 如果已达到最大并发数，等待
    if (this.activeTasks.size >= this.concurrency) {
      return;
    }

    // 获取下一个待处理任务
    const task = await this.taskStore.getNextPending();
    if (!task) {
      return;
    }

    // 检查任务是否已在活跃列表中
    if (this.activeTasks.has(task.id)) {
      return;
    }

    // 先添加到活跃任务列表（立即占用并发槽位）
    this.activeTasks.set(task.id, { task, startedAt: Date.now() });

    // 标记为处理中
    try {
      await this.taskStore.markProcessing(task.id);
    } catch (error) {
      // 如果标记失败，从活跃列表中移除
      this.activeTasks.delete(task.id);
      this.logger.error('Failed to mark task as processing', { task_id: task.id, error: error.message });
      return;
    }

    // 执行任务
    this.executeTask(task).catch(err => {
      this.logger.error('Task execution error', { task_id: task.id, error: err.message });
    });
  }

  /**
   * 执行单个任务
   */
  async executeTask(task) {
    const taskId = task.id;

    // 添加到活跃任务列表（用于并发控制）
    this.activeTasks.set(taskId, { task, startedAt: Date.now() });

    // 从 metadata 中提取参数
    const metadata = task.metadata || {};
    const webhookUrl = metadata.webhook_url;

    // 创建任务超时
    const timeout = setTimeout(async () => {
      this.logger.warn('Task timeout', { task_id: taskId });
      await this.taskStore.markFailed(taskId, 'Task execution timeout');
      this.activeTasks.delete(taskId);
      this.emit('taskFailed', { taskId, reason: 'timeout' });

      // 发送 webhook 通知（使用自定义 URL）
      if (this.webhookNotifier && webhookUrl) {
        await this.webhookNotifier.sendCustomNotification('task.timeout', {
          task_id: taskId,
          error: 'Task execution timeout',
        }, webhookUrl);
      } else if (this.webhookNotifier) {
        await this.webhookNotifier.notifyTaskFailed(taskId, 'Task execution timeout');
      }

      this.processQueue();
    }, this.defaultTimeout);

    try {
      // 执行 Claude 命令（使用 metadata 中的参数）
      const result = await this.claudeExecutor.execute({
        prompt: task.prompt,
        projectPath: task.project_path,
        model: task.model,
        sessionId: metadata.session_id,
        systemPrompt: metadata.system_prompt,
        maxBudgetUsd: metadata.max_budget_usd,
        allowedTools: metadata.allowed_tools,
        disallowedTools: metadata.disallowed_tools,
        agent: metadata.agent,
        mcpConfig: metadata.mcp_config,
      });

      // 清除超时
      clearTimeout(timeout);

      if (result.success) {
        // 标记为成功
        await this.taskStore.markCompleted(
          taskId,
          result.result,
          result.cost_usd
        );
        this.logger.info('Task completed', {
          task_id: taskId,
          duration_ms: result.duration_ms,
          cost_usd: result.cost_usd,
        });
        this.emit('taskCompleted', { taskId, result });

        // 发送 webhook 通知（使用自定义 URL）
        if (this.webhookNotifier && webhookUrl) {
          await this.webhookNotifier.sendCustomNotification('task.completed', {
            task_id: taskId,
            result: result.result,
            duration_ms: result.duration_ms,
            cost_usd: result.cost_usd,
            session_id: result.session_id,
            usage: result.usage,
          }, webhookUrl);
        } else if (this.webhookNotifier) {
          await this.webhookNotifier.notifyTaskCompleted(taskId, result);
        }
      } else {
        // 标记为失败
        await this.taskStore.markFailed(taskId, result.error);
        this.logger.error('Task failed', {
          task_id: taskId,
          error: result.error,
        });
        this.emit('taskFailed', { taskId, error: result.error });

        // 发送 webhook 通知（使用自定义 URL）
        if (this.webhookNotifier && webhookUrl) {
          await this.webhookNotifier.sendCustomNotification('task.failed', {
            task_id: taskId,
            error: result.error,
          }, webhookUrl);
        } else if (this.webhookNotifier) {
          await this.webhookNotifier.notifyTaskFailed(taskId, result.error);
        }
      }
    } catch (error) {
      // 清除超时
      clearTimeout(timeout);

      // 标记为失败
      await this.taskStore.markFailed(taskId, error.message);
      this.logger.error('Task error', {
        task_id: taskId,
        error: error.message,
      });
      this.emit('taskFailed', { taskId, error: error.message });

      // 发送 webhook 通知（使用自定义 URL）
      if (this.webhookNotifier && webhookUrl) {
        await this.webhookNotifier.sendCustomNotification('task.error', {
          task_id: taskId,
          error: error.message,
        }, webhookUrl);
      } else if (this.webhookNotifier) {
        await this.webhookNotifier.notifyTaskFailed(taskId, error.message);
      }
    } finally {
      // 从活跃任务中移除
      this.activeTasks.delete(taskId);

      // 触发下一个任务
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId) {
    const task = await this.taskStore.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    // 只能取消 pending 或 processing 状态的任务
    if (task.status !== 'pending' && task.status !== 'processing') {
      return {
        success: false,
        error: `Cannot cancel task with status: ${task.status}`,
      };
    }

    // 如果正在执行，从活跃任务中移除
    if (this.activeTasks.has(taskId)) {
      this.activeTasks.delete(taskId);
    }

    // 标记为已取消
    const result = await this.taskStore.cancel(taskId);
    if (result) {
      this.logger.info('Task cancelled', { task_id: taskId });
      this.emit('taskCancelled', { taskId });

      // 发送 webhook 通知
      if (this.webhookNotifier) {
        await this.webhookNotifier.notifyTaskCancelled(taskId);
      }

      return { success: true };
    }

    return { success: false, error: 'Failed to cancel task' };
  }

  /**
   * 获取队列状态
   */
  async getStatus() {
    const stats = await this.taskStore.getStats();

    return {
      running: this.running,
      concurrency: this.concurrency,
      active_tasks: this.activeTasks.size,
      ...stats,
    };
  }

  /**
   * 恢复之前未完成的任务
   */
  async restorePendingTasks() {
    const processingTasks = await this.taskStore.list({ status: 'processing' });

    if (processingTasks.length > 0) {
      this.logger.info('Restoring pending tasks', {
        count: processingTasks.length,
      });

      // 将处理中的任务重置为待处理
      for (const task of processingTasks) {
        await this.taskStore.update(task.id, { status: 'pending' });
      }
    }
  }
}

module.exports = TaskQueue;

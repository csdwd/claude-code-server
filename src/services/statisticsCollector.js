const StatsStore = require('../storage/statsStore');
const cron = require('node-cron');
const getLogger = require('../utils/logger');

/**
 * 统计收集服务
 */
class StatisticsCollector {
  constructor(config, statsStore) {
    this.config = config;
    this.statsStore = statsStore;
    this.logger = getLogger({ logFile: config.logFile, logLevel: config.logLevel });
    this.collectionTask = null;
  }

  /**
   * 启动统计收集
   */
  start() {
    if (!this.config.statistics?.enabled) {
      this.logger.info('Statistics collection is disabled');
      return;
    }

    // 每分钟收集一次统计信息
    const interval = this.config.statistics.collectionInterval || 60000;
    const cronExpression = this.intervalToCron(interval);

    this.collectionTask = cron.schedule(cronExpression, async () => {
      await this.collectStatistics();
    });

    this.logger.info('Statistics collector started', { interval });
  }

  /**
   * 停止统计收集
   */
  stop() {
    if (this.collectionTask) {
      this.collectionTask.stop();
      this.collectionTask = null;
      this.logger.info('Statistics collector stopped');
    }
  }

  /**
   * 收集统计信息
   */
  async collectStatistics() {
    try {
      // 这里可以收集系统级别的统计信息
      // 例如：内存使用、CPU 使用等

      const stats = {
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      };

      this.logger.debug('Statistics collected', stats);
    } catch (error) {
      this.logger.error('Failed to collect statistics', { error: error.message });
    }
  }

  /**
   * 获取汇总统计
   */
  async getSummary() {
    return await this.statsStore.getSummary();
  }

  /**
   * 获取每日统计
   */
  async getDaily(options = {}) {
    return await this.statsStore.getDaily(options);
  }

  /**
   * 获取日期范围统计
   */
  async getByDateRange(startDate, endDate) {
    return await this.statsStore.getByDateRange(startDate, endDate);
  }

  /**
   * 获取热门模型
   */
  async getTopModels(limit = 10) {
    return await this.statsStore.getTopModels(limit);
  }

  /**
   * 重置统计
   */
  async reset() {
    return await this.statsStore.reset();
  }

  /**
   * 将间隔转换为 cron 表达式
   */
  intervalToCron(intervalMs) {
    // 简单实现：每分钟执行一次
    // 更复杂的实现可以根据间隔动态生成 cron 表达式
    return '* * * * *';
  }
}

module.exports = StatisticsCollector;

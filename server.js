const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 配置目录和文件
const configDir = path.join(os.homedir(), '.claude-code-server');
const configPath = path.join(configDir, 'config.json');
const defaultConfig = {
  port: 3000,
  host: '0.0.0.0',
  claudePath: path.join(os.homedir(), '.nvm', 'versions', 'node', 'v22.21.0', 'bin', 'claude'),
  nvmBin: path.join(os.homedir(), '.nvm', 'versions', 'node', 'v22.21.0', 'bin'),
  defaultProjectPath: path.join(os.homedir(), 'workspace'),
  logFile: './logs/server.log',
  pidFile: './logs/server.pid',
  dataDir: './data',
  storageType: 'memory',
  redisUrl: null,
  sessionRetentionDays: 30,
  taskQueue: {
    concurrency: 3,
    defaultTimeout: 300000
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    maxRequests: 100
  },
  defaultModel: 'claude-sonnet-4-5',
  maxBudgetUsd: 10.0,
  webhook: {
    enabled: false,
    defaultUrl: null,
    timeout: 5000,
    retries: 3
  },
  statistics: {
    enabled: true,
    collectionInterval: 60000
  },
  mcp: {
    enabled: false,
    configPath: null
  },
  logLevel: 'info'
};

// 确保配置目录存在并加载配置
function loadConfig() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// 加载配置
const config = loadConfig();

// 重置所有服务模块的缓存（确保后台模式使用正确的配置）
const modulePaths = [
  './src/utils/logger',
  './src/services/claudeExecutor',
  './src/services/sessionManager',
  './src/services/rateLimiter',
  './src/services/statisticsCollector',
  './src/services/taskQueue',
  './src/services/webhookNotifier',
  './src/storage/sessionStore',
  './src/storage/taskStore',
  './src/storage/statsStore',
];

modulePaths.forEach(path => {
  delete require.cache[require.resolve(path)];
});

// 初始化存储
const SessionStore = require('./src/storage/sessionStore');
const TaskStore = require('./src/storage/taskStore');
const StatsStore = require('./src/storage/statsStore');

const sessionStore = new SessionStore(config.dataDir + '/sessions');
const taskStore = new TaskStore(config.dataDir + '/tasks');
const statsStore = new StatsStore(config.dataDir + '/statistics');

// 初始化服务
const ClaudeExecutor = require('./src/services/claudeExecutor');
const SessionManager = require('./src/services/sessionManager');
const RateLimiter = require('./src/services/rateLimiter');
const StatisticsCollector = require('./src/services/statisticsCollector');
const TaskQueue = require('./src/services/taskQueue');
const WebhookNotifier = require('./src/services/webhookNotifier');
const claudeExecutor = new ClaudeExecutor(config, sessionStore, statsStore);
const sessionManager = new SessionManager(config, sessionStore, claudeExecutor);
const rateLimiter = new RateLimiter(config);
const statisticsCollector = new StatisticsCollector(config, statsStore);
const webhookNotifier = new WebhookNotifier(config);
const taskQueue = new TaskQueue(config, taskStore, claudeExecutor, webhookNotifier);

// 加载路由
const createHealthRoute = require('./src/routes/health');
const createConfigRoute = require('./src/routes/config');
const createClaudeRoutes = require('./src/routes/claude');
const createSessionRoutes = require('./src/routes/sessions');
const createStatisticsRoutes = require('./src/routes/statistics');
const createTaskRoutes = require('./src/routes/tasks');

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || config.port;
const HOST = process.env.HOST || config.host;

// 中间件
app.use(express.json());

// 应用速率限制
app.use('/api/', rateLimiter.getMiddleware());

// 挂载路由
app.get('/health', createHealthRoute());
app.get('/api/config', createConfigRoute(configPath));
app.use('/api/claude', createClaudeRoutes(claudeExecutor, config, taskQueue, sessionManager));
app.use('/api/sessions', createSessionRoutes(sessionManager));
app.use('/api/statistics', createStatisticsRoutes(statisticsCollector));
app.use('/api/tasks', createTaskRoutes(taskQueue));

// 配置热重载
let configWatcher = null;
let reloadCount = 0;

// 热重载配置
async function hotReloadConfig() {
  try {
    reloadCount++;
    const logger = require('./src/utils/logger')({ logFile: config.logFile, logLevel: config.logLevel });

    logger.info(`[Config Reload #${reloadCount}] 检测到配置文件变化，重新加载配置...`);

    // 重新加载配置
    const newConfig = loadConfig();

    // 检查关键配置变化
    const configChanges = [];
    if (newConfig.taskQueue?.concurrency !== config.taskQueue?.concurrency) {
      configChanges.push(`taskQueue.concurrency: ${config.taskQueue?.concurrency} → ${newConfig.taskQueue?.concurrency}`);
      // 更新 TaskQueue 并发数
      taskQueue.concurrency = newConfig.taskQueue?.concurrency || 3;
      taskQueue.defaultTimeout = newConfig.taskQueue?.defaultTimeout || 300000;
    }
    if (newConfig.taskQueue?.defaultTimeout !== config.taskQueue?.defaultTimeout) {
      configChanges.push(`taskQueue.defaultTimeout: ${config.taskQueue?.defaultTimeout} → ${newConfig.taskQueue?.defaultTimeout}`);
    }
    if (newConfig.rateLimit?.enabled !== config.rateLimit?.enabled) {
      configChanges.push(`rateLimit.enabled: ${config.rateLimit?.enabled} → ${newConfig.rateLimit?.enabled}`);
    }
    if (newConfig.webhook?.enabled !== config.webhook?.enabled) {
      configChanges.push(`webhook.enabled: ${config.webhook?.enabled} → ${newConfig.webhook?.enabled}`);
      // 更新 WebhookNotifier
      webhookNotifier.config = newConfig;
    }
    if (newConfig.logLevel !== config.logLevel) {
      configChanges.push(`logLevel: ${config.logLevel} → ${newConfig.logLevel}`);
    }

    // 更新配置对象（保留引用）
    Object.assign(config, newConfig);

    if (configChanges.length > 0) {
      logger.info(`[Config Reload #${reloadCount}] 配置已更新:`, { changes: configChanges });
    } else {
      logger.info(`[Config Reload #${reloadCount}] 配置文件已重新加载（无变化）`);
    }

    logger.info(`[Config Reload #${reloadCount}] 当前任务队列并发数: ${taskQueue.concurrency}`);

  } catch (error) {
    const logger = require('./src/utils/logger')({ logFile: config.logFile, logLevel: 'error' });
    logger.error(`[Config Reload #${reloadCount}] 配置重载失败:`, { error: error.message });
  }
}

// 启动配置文件监听
function startConfigWatcher() {
  if (configWatcher) {
    return; // 已经在监听
  }

  try {
    // 使用防抖，避免多次触发
    let reloadTimer = null;
    const DEBOUNCE_DELAY = 500; // 500ms 防抖

    configWatcher = fs.watch(configPath, (eventType, filename) => {
      if (eventType === 'change') {
        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }
        reloadTimer = setTimeout(() => {
          hotReloadConfig();
          reloadTimer = null;
        }, DEBOUNCE_DELAY);
      }
    });

    const logger = require('./src/utils/logger')({ logFile: config.logFile, logLevel: config.logLevel });
    logger.info(`配置文件监听已启动: ${configPath}`);
    logger.info('配置文件修改将自动生效（热重载）');
  } catch (error) {
    const logger = require('./src/utils/logger')({ logFile: config.logFile, logLevel: config.logLevel });
    logger.error('启动配置文件监听失败:', { error: error.message });
  }
}

// 启动服务器
const server = app.listen(PORT, HOST, async () => {
  // 初始化存储
  await sessionStore.init();
  await taskStore.init();
  await statsStore.init();

  const logger = require('./src/utils/logger')({ logFile: config.logFile, logLevel: config.logLevel });
  logger.info(`Claude Code Server started on http://${HOST}:${PORT}`);
  logger.info(`Claude path: ${config.claudePath}`);
  logger.info(`Default project: ${config.defaultProjectPath}`);

  // 启动统计收集器
  statisticsCollector.start();

  // 启动任务队列
  await taskQueue.start();

  // 启动配置文件监听
  startConfigWatcher();

  // 写入 PID 文件
  if (config.pidFile) {
    const pidDir = path.dirname(config.pidFile);
    if (!fs.existsSync(pidDir)) {
      fs.mkdirSync(pidDir, { recursive: true });
    }
    fs.writeFileSync(config.pidFile, process.pid.toString());
  }
});

// 优雅关闭
async function shutdown(signal) {
  const logger = require('./src/utils/logger')({ logFile: config.logFile, logLevel: config.logLevel });
  logger.info(`${signal} received, shutting down gracefully...`);

  // 停止配置文件监听
  if (configWatcher) {
    configWatcher.close();
    configWatcher = null;
    logger.info('配置文件监听已停止');
  }

  // 停止统计收集器
  statisticsCollector.stop();

  // 停止任务队列
  await taskQueue.stop();

  server.close(() => {
    logger.info('Server closed');

    // 删除 PID 文件
    if (fs.existsSync(config.pidFile)) {
      fs.unlinkSync(config.pidFile);
    }

    process.exit(0);
  });

  // 强制退出超时
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;

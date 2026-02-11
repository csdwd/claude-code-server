const winston = require('winston');
const path = require('path');
const fs = require('fs');

/**
 * 日志工具
 */
class Logger {
  constructor(config = {}) {
    this.logFile = config.logFile || './logs/server.log';
    this.logLevel = config.logLevel || 'info';
    this.logger = null;
  }

  /**
   * 初始化日志
   */
  init() {
    // 如果 logger 已存在，不重新创建（避免重复初始化）
    if (this.logger) {
      return;
    }

    // 确保日志目录存在
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 只使用文件传输，完全不使用控制台输出
    const transports = [
      new winston.transports.File({
        filename: this.logFile,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),
    ];

    // 创建 logger
    this.logger = winston.createLogger({
      level: this.logLevel,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports,
    });
  }

  info(message, meta = {}) {
    if (this.logger) {
      this.logger.info(message, meta);
    }
  }

  error(message, meta = {}) {
    if (this.logger) {
      this.logger.error(message, meta);
    }
  }

  warn(message, meta = {}) {
    if (this.logger) {
      this.logger.warn(message, meta);
    }
  }

  debug(message, meta = {}) {
    if (this.logger) {
      this.logger.debug(message, meta);
    }
  }
}

// 单例 - 简化实现，避免重复创建
let loggerInstance = null;

function getLogger(config) {
  // 如果实例不存在，创建新实例
  if (!loggerInstance) {
    loggerInstance = new Logger(config);
    loggerInstance.init();
  }

  return loggerInstance;
}

module.exports = getLogger;

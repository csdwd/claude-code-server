const rateLimit = require('express-rate-limit');
const getLogger = require('../utils/logger');

/**
 * 速率限制服务
 */
class RateLimiter {
  constructor(config) {
    this.config = config;
    this.logger = getLogger({ logFile: config.logFile, logLevel: config.logLevel });
    this.limiter = null;
  }

  /**
   * 创建速率限制中间件
   */
  createLimiter(options = {}) {
    const config = this.config.rateLimit || {};

    if (!config.enabled || !this.config.rateLimit?.enabled) {
      // 速率限制未启用，返回一个空中间件
      return (req, res, next) => next();
    }

    const windowMs = options.windowMs || config.windowMs || 60000;
    const maxRequests = options.max || config.maxRequests || 100;

    this.limiter = rateLimit({
      windowMs,
      max: maxRequests,
      message: {
        success: false,
        error: 'Too many requests, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.logger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
        });
        res.status(429).json({
          success: false,
          error: 'Too many requests, please try again later.',
          retryAfter: Math.ceil(windowMs / 1000),
        });
      },
      skip: (req) => {
        // 可以在这里添加跳过速率限制的逻辑
        // 例如：跳过特定 IP 或路径
        return false;
      },
    });

    this.logger.info('Rate limiter initialized', {
      windowMs,
      maxRequests,
    });

    return this.limiter;
  }

  /**
   * 获取速率限制中间件
   */
  getMiddleware() {
    if (!this.limiter) {
      return this.createLimiter();
    }
    return this.limiter;
  }

  /**
   * 为特定路由创建自定义限制器
   */
  createCustomLimiter(options) {
    return rateLimit({
      windowMs: options.windowMs || 60000,
      max: options.max || 100,
      message: options.message || {
        success: false,
        error: 'Too many requests, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }
}

module.exports = RateLimiter;

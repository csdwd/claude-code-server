const fs = require('fs');
const path = require('path');

/**
 * 配置信息路由
 */
function createConfigRoute(configPath) {
  return (req, res) => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    res.json({
      port: config.port,
      defaultProjectPath: config.defaultProjectPath,
      defaultModel: config.defaultModel,
      rateLimit: config.rateLimit,
      statistics: config.statistics,
      version: require('../../package.json').version,
    });
  };
}

module.exports = createConfigRoute;

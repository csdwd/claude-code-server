const express = require('express');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 加载配置
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const PORT = process.env.PORT || config.port;
const HOST = process.env.HOST || config.host;

// 中间件
app.use(express.json());

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());

  // 写入日志文件
  if (config.logFile) {
    const logDir = path.dirname(config.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(config.logFile, logMessage);
  }
}

// 执行 claude 命令
function executeClaude(prompt, projectPath) {
  const startTime = Date.now();

  try {
    const cmd = `cd ${projectPath} && PATH=${config.nvmBin}:$PATH ${config.claudePath} -p '${prompt.replace(/'/g, "'\"'\"'")}' --output-format json --allow-dangerously-skip-permissions`;

    log(`Executing: cd ${projectPath} && claude -p "${prompt.substring(0, 50)}..."`);

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300000, // 5分钟超时
    });

    const result = JSON.parse(output.trim());
    const duration = Date.now() - startTime;

    log(`Success: ${duration}ms, cost: $${result.total_cost_usd || 0}`);

    return {
      success: true,
      result: result.result,
      duration_ms: duration,
      cost_usd: result.total_cost_usd || 0,
      session_id: result.session_id,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    log(`Error: ${error.message}`);

    return {
      success: false,
      error: error.message,
      duration_ms: duration,
    };
  }
}

// API 路由

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 获取配置信息
app.get('/api/config', (req, res) => {
  res.json({
    port: config.port,
    defaultProjectPath: config.defaultProjectPath,
    version: require('./package.json').version,
  });
});

// 主 API：调用 Claude
app.post('/api/claude', (req, res) => {
  const { prompt, project_path } = req.body;

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: prompt',
    });
  }

  const projectPath = project_path || config.defaultProjectPath;

  log(`API Request: prompt="${prompt.substring(0, 50)}..." project="${projectPath}"`);

  const result = executeClaude(prompt, projectPath);
  res.json(result);
});

// 启动服务器
const server = app.listen(PORT, HOST, () => {
  log(`Claude API Server started on http://${HOST}:${PORT}`);
  log(`Claude path: ${config.claudePath}`);
  log(`Default project: ${config.defaultProjectPath}`);

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
process.on('SIGTERM', () => {
  log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

module.exports = app;

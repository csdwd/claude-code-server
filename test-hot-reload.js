#!/usr/bin/env node

/**
 * 测试配置热重载功能
 * 运行此脚本后，修改 ~/.claude-code-server/config.json
 * 观察日志输出，应该看到配置自动重载
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const configDir = path.join(os.homedir(), '.claude-code-server');
const configPath = path.join(configDir, 'config.json');

console.log('='.repeat(60));
console.log('配置热重载测试');
console.log('='.repeat(60));
console.log('');
console.log(`配置文件: ${configPath}`);
console.log('');
console.log('请按照以下步骤测试：');
console.log('');
console.log('1. 启动服务: node cli.js');
console.log('2. 观察日志: tail -f logs/server.log');
console.log('3. 修改配置: 编辑 ~/.claude-code-server/config.json');
console.log('   例如: 修改 "concurrency" 的值');
console.log('4. 保存文件');
console.log('5. 观察日志，应该看到类似以下输出：');
console.log('');
console.log('  [Config Reload #1] 检测到配置文件变化，重新加载配置...');
console.log('  [Config Reload #1] 配置已更新: taskQueue.concurrency: 3 → 1');
console.log('  [Config Reload #1] 当前任务队列并发数: 1');
console.log('');
console.log('='.repeat(60));
console.log('');

// 检查配置文件
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✓ 配置文件存在');
  console.log('  当前配置:');
  console.log(`    - 并发数: ${config.taskQueue?.concurrency || 3}`);
  console.log(`    - 超时: ${config.taskQueue?.defaultTimeout || 300000}ms`);
  console.log(`    - Webhook: ${config.webhook?.enabled ? '已启用' : '未启用'}`);
  console.log('');
} else {
  console.log('⚠ 配置文件不存在，将在首次启动时自动创建');
  console.log('');
}

// 提供快速修改配置的命令
console.log('快速修改配置示例:');
console.log('');
console.log(`  # 修改并发数为 1`);
console.log(`  jq '.taskQueue.concurrency = 1' ${configPath} > /tmp/config.tmp && mv /tmp/config.tmp ${configPath}`);
console.log('');
console.log(`  # 修改并发数为 5`);
console.log(`  jq '.taskQueue.concurrency = 5' ${configPath} > /tmp/config.tmp && mv /tmp/config.tmp ${configPath}`);
console.log('');
console.log('='.repeat(60));

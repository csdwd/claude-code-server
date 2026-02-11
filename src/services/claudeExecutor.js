const { spawn } = require('child_process');
const getLogger = require('../utils/logger');

/**
 * Claude 执行器
 */
class ClaudeExecutor {
  constructor(config, sessionStore = null, statsStore = null) {
    this.config = config;
    this.sessionStore = sessionStore;
    this.statsStore = statsStore;
    this.logger = getLogger({ logFile: config.logFile, logLevel: config.logLevel });
  }

  /**
   * 执行 Claude 命令
   */
  async execute(options) {
    const {
      prompt,
      projectPath,
      model = this.config.defaultModel,
      sessionId = null,
      systemPrompt = null,
      maxBudgetUsd = this.config.maxBudgetUsd,
      allowedTools = null,
      disallowedTools = null,
      agent = null,
      stream = false,
    } = options;

    // 预算控制：检查会话当前花费
    if (sessionId && maxBudgetUsd && this.sessionStore) {
      const session = await this.sessionStore.get(sessionId);
      if (session && session.total_cost_usd >= maxBudgetUsd) {
        this.logger.warn(`Budget exceeded for session`, {
          session_id: sessionId,
          current_cost: session.total_cost_usd,
          max_budget: maxBudgetUsd,
        });
        return {
          success: false,
          error: `Budget exceeded: session has already spent $${session.total_cost_usd.toFixed(2)} of $${maxBudgetUsd.toFixed(2)} limit`,
          budget_exceeded: true,
          current_cost_usd: session.total_cost_usd,
          max_budget_usd: maxBudgetUsd,
        };
      }
    }

    const startTime = Date.now();

    try {
      // 构建命令参数
      const args = this.buildCommandArgs({
        prompt,
        model,
        sessionId,
        systemPrompt,
        maxBudgetUsd,
        allowedTools,
        disallowedTools,
        agent,
        mcpConfig: options.mcpConfig,
      });

      this.logger.info(`Executing Claude command`, {
        prompt: prompt.substring(0, 50) + '...',
        projectPath,
        model,
        args: args.join(' ').substring(0, 200) + '...',
      });

      // 使用 spawn 异步执行
      const result = await this.spawnCommand(projectPath, args);

      const duration = Date.now() - startTime;
      const costUsd = result.total_cost_usd || 0;

      this.logger.info(`Claude command succeeded`, {
        duration_ms: duration,
        cost_usd: costUsd,
        session_id: result.session_id,
      });

      // 预算控制：检查执行后是否超预算
      if (sessionId && maxBudgetUsd && this.sessionStore) {
        const session = await this.sessionStore.get(sessionId);
        const newTotalCost = (session?.total_cost_usd || 0) + costUsd;

        if (newTotalCost > maxBudgetUsd) {
          this.logger.warn(`Budget would be exceeded`, {
            session_id: sessionId,
            new_total: newTotalCost,
            max_budget: maxBudgetUsd,
          });

          return {
            success: false,
            error: `Budget would be exceeded: this request costs $${costUsd.toFixed(2)}, which would bring total to $${newTotalCost.toFixed(2)} exceeding the $${maxBudgetUsd.toFixed(2)} limit`,
            budget_exceeded: true,
            request_cost_usd: costUsd,
            current_cost_usd: session?.total_cost_usd || 0,
            max_budget_usd: maxBudgetUsd,
          };
        }
      }

      // 记录统计
      if (this.statsStore && this.config.statistics?.enabled) {
        await this.statsStore.recordRequest({
          success: true,
          model,
          cost_usd: costUsd,
          input_tokens: result.usage?.input_tokens || 0,
          output_tokens: result.usage?.output_tokens || 0,
        });
      }

      // 更新会话花费
      if (this.sessionStore && sessionId) {
        await this.sessionStore.addCost(sessionId, costUsd);
        await this.sessionStore.incrementMessages(sessionId);
      }

      return {
        success: true,
        result: result.result,
        duration_ms: duration,
        cost_usd: costUsd,
        session_id: result.session_id,
        usage: result.usage,
      };
    } catch (err) {
      const duration = Date.now() - startTime;

      this.logger.error(`Claude command failed`, {
        error: err.message,
        duration_ms: duration,
      });

      // 记录失败统计
      if (this.statsStore && this.config.statistics?.enabled) {
        await this.statsStore.recordRequest({
          success: false,
          model,
        });
      }

      return {
        success: false,
        error: err.message,
        duration_ms: duration,
      };
    }
  }

  /**
   * 使用 spawn 执行命令
   */
  spawnCommand(projectPath, args) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      env.PATH = `${this.config.nvmBin}:${env.PATH}`;

      const child = spawn(this.config.claudePath, args, {
        cwd: projectPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 超时处理
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Command execution timeout'));
      }, 300000); // 5分钟超时

      child.on('close', (code) => {
        clearTimeout(timeout);
        const output = stdout || stderr;

        if (code !== 0) {
          return reject(new Error(`Command failed with code ${code}: ${output}`));
        }

        if (!output || output.trim().length === 0) {
          return reject(new Error('Empty output from Claude CLI'));
        }

        try {
          const result = JSON.parse(output.trim());
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse JSON output: ${err.message}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn command: ${err.message}`));
      });
    });
  }

  /**
   * 构建命令参数数组
   */
  buildCommandArgs(options) {
    const {
      prompt,
      model,
      sessionId,
      systemPrompt,
      maxBudgetUsd,
      allowedTools,
      disallowedTools,
      agent,
      mcpConfig,
    } = options;

    const args = ['-p', prompt, '--output-format', 'json'];

    // 添加模型
    if (model) {
      args.push('--model', model);
    }

    // 添加会话 ID
    if (sessionId) {
      args.push('--session-id', sessionId);
    }

    // 添加系统提示
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    // 添加预算限制
    if (maxBudgetUsd) {
      args.push('--max-budget-usd', maxBudgetUsd.toString());
    }

    // 添加允许的工具
    if (allowedTools && allowedTools.length > 0) {
      args.push('--allowed-tools', allowedTools.join(','));
    }

    // 添加禁止的工具
    if (disallowedTools && disallowedTools.length > 0) {
      args.push('--disallowed-tools', disallowedTools.join(','));
    }

    // 添加 agent
    if (agent) {
      args.push('--agent', agent);
    }

    // 添加 MCP 配置
    const mcpConfigPath = mcpConfig || (this.config.mcp?.enabled ? this.config.mcp.configPath : null);
    if (mcpConfigPath) {
      args.push('--mcp-config', mcpConfigPath);
    }

    // 跳过权限检查
    args.push('--allow-dangerously-skip-permissions');

    return args;
  }

  /**
   * 转义 shell 参数（保留用于可能的 shell 命令）
   */
  escapeArg(arg) {
    return arg.replace(/'/g, "'\"'\"'");
  }
}

module.exports = ClaudeExecutor;

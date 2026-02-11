const Validators = require('../utils/validators');
const crypto = require('crypto');

/**
 * Claude API 路由
 */
function createClaudeRoutes(claudeExecutor, config, taskQueue = null, sessionManager = null) {
  const router = require('express').Router();

  // POST /api/claude - 单个请求（支持同步和异步）
  router.post('/', async (req, res) => {
    const {
      prompt,
      project_path,
      model,
      session_id,
      system_prompt,
      max_budget_usd,
      allowed_tools,
      disallowed_tools,
      agent,
      mcp_config,
      stream,
      async: isAsync,
      webhook_url,
      priority,
    } = req.body;

    // 验证请求
    const validation = Validators.validateClaudeRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    const projectPath = project_path || config.defaultProjectPath;

    // 流式输出暂不支持
    if (stream) {
      return res.status(501).json({
        success: false,
        error: 'Streaming is not yet implemented',
      });
    }

    // 自动创建会话（如果没有 session_id）
    let sessionId = session_id;
    if (!sessionId && sessionManager) {
      try {
        const session = await sessionManager.createSession({
          project_path: projectPath,
          model: model || config.defaultModel,
          metadata: {
            auto_created: true,
          },
        });
        sessionId = session.id;
      } catch (error) {
        // 如果创建会话失败，继续执行但不使用会话
        console.error('Failed to auto-create session:', error.message);
      }
    }

    // 异步执行模式
    if (isAsync) {
      if (!taskQueue) {
        return res.status(501).json({
          success: false,
          error: 'Async execution is not available (task queue not initialized)',
        });
      }

      try {
        // 创建异步任务
        const task = await taskQueue.addTask({
          prompt,
          project_path: projectPath,
          model,
          priority: priority || 5, // 默认优先级 5
          metadata: {
            webhook_url: webhook_url || config.webhook?.defaultUrl,
            session_id: sessionId,
            system_prompt,
            max_budget_usd,
            allowed_tools,
            disallowed_tools,
            agent,
            mcp_config,
          },
        });

        return res.status(202).json({
          success: true,
          message: 'Task created successfully',
          task_id: task.id,
          status: task.status,
          priority: task.priority,
          session_id: sessionId, // 返回 session_id
          webhook_url: task.metadata.webhook_url,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }

    // 同步执行模式（默认）
    const result = await claudeExecutor.execute({
      prompt,
      projectPath,
      model,
      sessionId: sessionId,
      systemPrompt: system_prompt,
      maxBudgetUsd: max_budget_usd,
      allowedTools: allowed_tools,
      disallowedTools: disallowed_tools,
      agent,
      mcpConfig: mcp_config,
      stream,
    });

    // 返回结果（包含 session_id）
    const statusCode = result.success ? 200 : 500;
    const responseData = result.success ? {
      ...result,
      session_id: sessionId, // 返回 session_id
    } : result;

    res.status(statusCode).json(responseData);
  });

  // POST /api/claude/batch - 批量处理
  router.post('/batch', async (req, res) => {
    const validation = Validators.validateBatchRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    const { prompts, project_path, model } = validation.value;
    const projectPath = project_path || config.defaultProjectPath;

    // 并发执行所有请求
    const promises = prompts.map(prompt =>
      claudeExecutor.execute({
        prompt,
        projectPath,
        model,
      })
    );

    try {
      const results = await Promise.all(promises);

      // 统计结果
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const totalCost = results.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
      const totalDuration = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0);

      res.json({
        success: true,
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failCount,
          total_cost_usd: totalCost,
          total_duration_ms: totalDuration,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = createClaudeRoutes;

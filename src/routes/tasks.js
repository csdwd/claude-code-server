const Validators = require('../utils/validators');

/**
 * 创建异步任务路由
 */
function createTaskRoutes(taskQueue) {
  const router = require('express').Router();

  // POST /api/tasks/async - 创建异步任务
  router.post('/async', async (req, res) => {
    const validation = Validators.validateTaskCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    try {
      const taskData = {
        ...validation.value,
        project_path: validation.value.project_path || req.app.locals.config?.defaultProjectPath,
      };

      const task = await taskQueue.addTask(taskData);

      res.status(201).json({
        success: true,
        task,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/tasks/:id - 获取任务状态
  router.get('/:id', async (req, res) => {
    try {
      const task = await taskQueue.taskStore.get(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
        });
      }

      res.json({
        success: true,
        task,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // PATCH /api/tasks/:id/priority - 修改任务优先级
  router.patch('/:id/priority', async (req, res) => {
    try {
      const { priority } = req.body;

      // 验证优先级
      if (typeof priority !== 'number' || priority < 1 || priority > 10) {
        return res.status(400).json({
          success: false,
          error: 'Priority must be a number between 1 and 10',
        });
      }

      const task = await taskQueue.taskStore.get(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
        });
      }

      // 只允许修改 pending 或 processing 状态的任务
      if (task.status !== 'pending' && task.status !== 'processing') {
        return res.status(400).json({
          success: false,
          error: `Cannot modify priority for task with status: ${task.status}`,
        });
      }

      // 更新优先级
      await taskQueue.taskStore.update(req.params.id, { priority });

      res.json({
        success: true,
        message: 'Priority updated',
        task_id: req.params.id,
        old_priority: task.priority,
        new_priority: priority,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // DELETE /api/tasks/:id - 取消任务
  router.delete('/:id', async (req, res) => {
    try {
      const result = await taskQueue.cancelTask(req.params.id);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/tasks - 列出任务
  router.get('/', async (req, res) => {
    try {
      const options = {
        status: req.query.status,
        limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      };

      const tasks = await taskQueue.taskStore.list(options);

      res.json({
        success: true,
        tasks,
        count: tasks.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/tasks/status - 获取队列状态
  router.get('/queue/status', async (req, res) => {
    try {
      const status = await taskQueue.getStatus();

      res.json({
        success: true,
        queue: status,
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

module.exports = createTaskRoutes;

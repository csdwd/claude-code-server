const Validators = require('../utils/validators');

/**
 * 创建会话路由
 */
function createSessionRoutes(sessionManager) {
  const router = require('express').Router();

  // POST /api/sessions - 创建会话
  router.post('/', async (req, res) => {
    const validation = Validators.validateSessionCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    try {
      const session = await sessionManager.createSession(validation.value);
      res.status(201).json({
        success: true,
        session,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/sessions - 列出会话
  router.get('/', async (req, res) => {
    try {
      const options = {
        status: req.query.status,
        project_path: req.query.project_path,
        limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      };

      const sessions = await sessionManager.listSessions(options);
      res.json({
        success: true,
        sessions,
        count: sessions.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/sessions/search - 搜索会话
  router.get('/search', async (req, res) => {
    const validation = Validators.validateSearchQuery(req.query);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    try {
      const options = {
        limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      };

      const sessions = await sessionManager.searchSessions(validation.value.q, options);
      res.json({
        success: true,
        sessions,
        count: sessions.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/sessions/:id - 获取会话详情
  router.get('/:id', async (req, res) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      res.json({
        success: true,
        session,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // POST /api/sessions/:id/continue - 继续会话
  router.post('/:id/continue', async (req, res) => {
    const validation = Validators.validateSessionContinue(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    try {
      const result = await sessionManager.continueSession(req.params.id, validation.value);

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/sessions/:id/stats - 获取会话统计
  router.get('/:id/stats', async (req, res) => {
    try {
      const stats = await sessionManager.getSessionStats(req.params.id);
      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // DELETE /api/sessions/:id - 删除会话
  router.delete('/:id', async (req, res) => {
    try {
      const result = await sessionManager.deleteSession(req.params.id);
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // PATCH /api/sessions/:id/status - 更新会话状态
  router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;

    if (!status || !['active', 'archived', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: active, archived, or closed',
      });
    }

    try {
      const result = await sessionManager.updateSessionStatus(req.params.id, status);
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = createSessionRoutes;

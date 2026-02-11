/**
 * 创建统计路由
 */
function createStatisticsRoutes(statsCollector) {
  const router = require('express').Router();

  // GET /api/statistics/summary - 获取汇总统计
  router.get('/summary', async (req, res) => {
    try {
      const summary = await statsCollector.getSummary();
      res.json({
        success: true,
        statistics: summary,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/statistics/daily - 获取每日统计
  router.get('/daily', async (req, res) => {
    try {
      const options = {
        limit: req.query.limit ? parseInt(req.query.limit) : 30,
      };

      const daily = await statsCollector.getDaily(options);
      res.json({
        success: true,
        daily,
        count: daily.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/statistics/range - 获取日期范围统计
  router.get('/range', async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: start and end',
      });
    }

    try {
      const range = await statsCollector.getByDateRange(start, end);
      res.json({
        success: true,
        statistics: range,
        count: range.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/statistics/models - 获取热门模型
  router.get('/models', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const models = await statsCollector.getTopModels(limit);
      res.json({
        success: true,
        models,
        count: models.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // GET /api/statistics - 获取完整统计
  router.get('/', async (req, res) => {
    try {
      const summary = await statsCollector.getSummary();
      const daily = await statsCollector.getDaily({ limit: 7 });
      const models = await statsCollector.getTopModels(5);

      res.json({
        success: true,
        statistics: {
          summary,
          recent_daily: daily,
          top_models: models,
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

module.exports = createStatisticsRoutes;

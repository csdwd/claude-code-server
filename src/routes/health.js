/**
 * 健康检查路由
 */
function createHealthRoute() {
  return (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
    });
  };
}

module.exports = createHealthRoute;

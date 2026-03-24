const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/fcc-api',
    createProxyMiddleware({
      target: 'https://broadbandmap.fcc.gov',
      changeOrigin: true,
      pathRewrite: {
        '^/fcc-api': '/api/public/map',
      },
      on: {
        error: (err, req, res) => {
          console.error('FCC Proxy error:', err.message);
          res.status(502).json({ error: 'FCC API proxy error', details: err.message });
        },
      },
    })
  );
};

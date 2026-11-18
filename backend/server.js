'use strict';
const cfg = require('./config');
const { createContext, createApp } = require('./app');

const ctx = createContext(cfg);
const app = createApp(ctx);
const server = app.listen(cfg.port, cfg.host, () => {
  ctx.log.info(`Polaris backend ${cfg.version} listening on http://${cfg.host}:${cfg.port} (public URL ${cfg.publicUrl})`, { signingKey: ctx.keys.keyId });
});
server.requestTimeout = 120000;
ctx.realtime.attach(server);

function shutdown(sig) {
  ctx.log.info(`received ${sig}, shutting down`);
  ctx.realtime.close();
  server.close(() => { try { ctx.db.close && ctx.db.close(); } catch {} process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => ctx.log.error('unhandled rejection', { error: e && e.message }));

// pm2 config for the VPS. Secrets come from /root/socialsync-app/.env (never from this file).
module.exports = {
  apps: [{
    name: 'socialsync',
    cwd: '/root/socialsync-app',
    script: 'node_modules/.bin/tsx',
    args: 'server.ts',
    interpreter: 'node',
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: 3460 },
    instances: 1,            // must stay 1: the scheduler and JSON store are single-process
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,        // avoid the old EADDRINUSE restart storm
    restart_delay: 5000,
    max_memory_restart: '512M',
  }],
};

module.exports = {
  apps: [{
    name: 'socialsync',
    script: 'npm',
    args: 'start',
    cwd: '/root/socialsync-app',
    env: {
      PORT: 3001,
      NODE_ENV: 'production'
    }
  }]
};

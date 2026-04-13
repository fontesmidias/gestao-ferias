module.exports = {
  apps: [
    {
      name: 'backend-api',
      cwd: './backend-api',
      script: './node_modules/fastify-cli/cli.js',
      args: 'start -l info dist/app.js',
      watch: ['dist'],
      ignore_watch: ['node_modules', 'src'],
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
    },
    {
      name: 'frontend-web',
      cwd: './frontend-web',
      script: './node_modules/next/dist/bin/next',
      args: 'dev -p 3002',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};

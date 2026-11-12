const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "jeitinho-api",
      cwd: path.join(__dirname, "apps", "api"),
      script: "dist/server.js",
      interpreter: "node",

      // Uma instancia evita duplicar tarefas periodicas e mantem o Socket.IO
      // e os uploads locais no mesmo processo.
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",

      // Credenciais continuam no .env do servidor, fora do repositorio.
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: 3333,
        TRUST_PROXY: "loopback, 192.168.199.39",
        WEB_URL: "https://www.jeitinhobrasileiroap.com",
        API_PUBLIC_URL: "https://apijb.nivel3ti.com.br",
      },

      time: true,
      merge_logs: true,
    },
  ],
};

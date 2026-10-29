const path = require("node:path");

const root = __dirname;
const apiDirectory = path.join(root, "packages", "api");
const appDirectory = path.join(root, "packages", "app");

module.exports = {
	apps: [
		{
			name: "BurnPermitAPI",
			script: path.join(apiDirectory, "dist", "server.js"),
			cwd: apiDirectory,
			max_memory_restart: "300M",
			instances: 2,
			exec_mode: "cluster",
			env_production: {
				NODE_ENV: "production",
			},
			env_development: {
				NODE_ENV: "development",
			},
		},
		{
			name: "BurnPermitApp",
			script: path.join(appDirectory, "serve.mjs"),
			cwd: appDirectory,
			instances: 1,
			exec_mode: "fork",
			env: {
				PORT: 50111,
			},
		},
	],
};

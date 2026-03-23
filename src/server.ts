import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppConfig } from "./config.js";
import { registerSonarQubeTools } from "./server/register-tools.js";
import { SonarQubeFindingService } from "./sonarqube/service.js";

/**
 * 当前包的最小元信息。
 *
 * @remarks
 * 这里直接从根目录 `package.json` 读取版本号，避免发布时维护两份版本。
 */
interface PackageMetadata {
  /** npm package 名称。 */
  name: string;
  /** npm package 版本号。 */
  version: string;
}

const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json") as PackageMetadata;

/**
 * MCP 服务启动后需要保留的运行期对象。
 *
 * @remarks
 * 当前只需要返回 MCP 服务实例本身。
 */
export interface ServerContext {
  /** 已注册完 tools 的 MCP 服务实例。 */
  server: McpServer;
}

/**
 * 创建并注册整个 MCP 服务器。
 *
 * @param config - 运行期配置。
 * @returns 已完成 tool 注册的 MCP 服务及其配套运行时对象。
 *
 * @remarks
 * 这里集中完成 schema 定义、tool 注册和运行时依赖装配。
 */
export function createServer(config: AppConfig): ServerContext {
  const server = new McpServer({
    name: packageMetadata.name,
    version: packageMetadata.version
  });

  const service = new SonarQubeFindingService(config);
  registerSonarQubeTools(server, service);

  return {
    server
  };
}

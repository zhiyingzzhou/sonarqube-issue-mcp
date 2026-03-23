import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

/**
 * 进程入口：加载配置、挂接 stdio transport，并处理优雅退出。
 *
 * @returns 启动完成后的异步流程。
 * @throws {SonarQubeMcpError | Error} 当配置或服务器初始化失败时抛出。
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const { server } = createServer(config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  /**
   * 统一资源清理逻辑。
   *
   * @remarks
   * 当前仅需关闭 MCP 服务本身。
   */
  const cleanup = async (): Promise<void> => {
    await server.close();
  };

  process.on("SIGINT", () => {
    void cleanup().finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    void cleanup().finally(() => process.exit(0));
  });

  console.error("SonarQube Issue MCP server is running on stdio");
}

main().catch((error) => {
  console.error("Failed to start SonarQube Issue MCP server:", error);
  process.exit(1);
});

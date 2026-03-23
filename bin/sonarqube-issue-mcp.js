#!/usr/bin/env node

/**
 * CLI 启动包装器。
 *
 * @remarks
 * npm / pnpm / yarn 在安装 `bin` 命令时会直接执行这个文件。
 * 这里保持最薄的一层，只负责转交到已构建的 MCP 服务入口。
 */
import "../dist/index.js";

/**
 * 统一错误码，便于 MCP 客户端按类别处理异常。
 *
 * @remarks
 * 这些错误码覆盖配置、鉴权、网络、远端服务和输入校验等主要失败路径。
 */
export type SonarQubeMcpErrorCode =
  | "CONFIG"
  | "VALIDATION"
  | "AUTH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INDEXING"
  | "REMOTE"
  | "NETWORK";

/**
 * MCP 内部统一错误对象。
 *
 * @remarks
 * 所有底层异常最终都会被归一为这个类型，再转换成对用户可读的文本输出。
 */
export class SonarQubeMcpError extends Error {
  readonly code: SonarQubeMcpErrorCode;
  readonly status: number | null;
  readonly details: unknown;

  constructor(
    code: SonarQubeMcpErrorCode,
    message: string,
    options?: {
      status?: number | null;
      details?: unknown;
      cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "SonarQubeMcpError";
    this.code = code;
    this.status = options?.status ?? null;
    this.details = options?.details ?? null;
  }
}

/**
 * 将任意异常收口为统一错误类型，避免上层反复判断。
 *
 * @param error - 原始异常对象。
 * @returns 统一后的 `SonarQubeMcpError`。
 */
export function normalizeError(error: unknown): SonarQubeMcpError {
  if (error instanceof SonarQubeMcpError) {
    return error;
  }

  if (error instanceof Error) {
    return new SonarQubeMcpError("REMOTE", error.message, { cause: error });
  }

  return new SonarQubeMcpError(
    "REMOTE",
    typeof error === "string" ? error : "发生了未知错误",
    { details: error }
  );
}

/**
 * 将统一错误渲染为 MCP 文本内容，方便客户端直接展示。
 *
 * @param error - 统一错误对象。
 * @returns 适合在聊天窗口直接显示的多行文本。
 */
export function formatErrorForText(error: SonarQubeMcpError): string {
  const lines = [
    `错误代码: ${error.code}`,
    `错误信息: ${error.message}`
  ];

  if (error.status !== null) {
    lines.push(`HTTP 状态: ${error.status}`);
  }

  if (error.details !== null) {
    lines.push(`错误详情: ${safeJson(error.details)}`);
  }

  return lines.join("\n");
}

/**
 * 错误详情可能包含循环引用，这里做一个安全序列化兜底。
 *
 * @param value - 需要输出的详情对象。
 * @returns 可安全展示的字符串。
 */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

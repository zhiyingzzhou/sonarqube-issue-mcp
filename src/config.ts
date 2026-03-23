import { SonarQubeMcpError } from "./errors.js";
import {
  DEFAULT_FINDING_CATEGORIES,
  DEFAULT_OVERVIEW_ITEMS,
  FINDING_CATEGORY_VALUES,
  OVERVIEW_ITEM_VALUES,
  type FindingCategory,
  type OverviewItemKey
} from "./types.js";

/**
 * 运行期配置，统一由环境变量解析得到。
 *
 * @remarks
 * 当前实现只保留 SonarQube Web API 主链路配置，不再维护浏览器兜底相关选项。
 */
export interface AppConfig {
  /** SonarQube 用户 token。 */
  sonarToken: string;
  /** 单次 SonarQube API 请求超时时间，单位毫秒。 */
  sonarRequestTimeoutMs: number;
  /** 可重试请求的最大重试次数。 */
  sonarRetryCount: number;
  /** SonarQube Web API 可选代理。 */
  sonarHttpProxy: string | null;
  /**
   * findings 列表工具默认启用的分类。
   *
   * @remarks
   * 对应环境变量 `SONAR_DEFAULT_FINDING_CATEGORIES`。
   */
  sonarDefaultFindingCategories: FindingCategory[];
  /**
   * overview 工具默认返回的总览项。
   *
   * @remarks
   * 对应环境变量 `SONAR_DEFAULT_OVERVIEW_ITEMS`。
   */
  sonarDefaultOverviewItems: OverviewItemKey[];
}

/**
 * 从环境变量加载完整配置。
 *
 * @param env - 运行时环境变量对象，默认使用 `process.env`。
 * @returns 经过校验和规范化后的应用配置。
 *
 * 这里会在启动时完成校验，避免把配置错误拖到真正处理请求时才暴露。
 *
 * @throws {SonarQubeMcpError}
 * 当必填项缺失、数值非法或代理地址格式错误时抛出。
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const sonarToken = env.SONAR_TOKEN?.trim();
  if (!sonarToken) {
    throw new SonarQubeMcpError(
      "CONFIG",
      "缺少 SONAR_TOKEN 环境变量，无法访问 SonarQube Web API。"
    );
  }

  return {
    sonarToken,
    sonarRequestTimeoutMs: parsePositiveInteger(
      env.SONAR_REQUEST_TIMEOUT_MS,
      20_000,
      "SONAR_REQUEST_TIMEOUT_MS"
    ),
    sonarRetryCount: parseNonNegativeInteger(
      env.SONAR_RETRY_COUNT,
      2,
      "SONAR_RETRY_COUNT"
    ),
    sonarHttpProxy: parseOptionalProxyUrl(env.SONAR_HTTP_PROXY, "SONAR_HTTP_PROXY"),
    sonarDefaultFindingCategories: parseEnumCsvEnv(
      env.SONAR_DEFAULT_FINDING_CATEGORIES,
      [...DEFAULT_FINDING_CATEGORIES],
      FINDING_CATEGORY_VALUES,
      "SONAR_DEFAULT_FINDING_CATEGORIES"
    ),
    sonarDefaultOverviewItems: parseEnumCsvEnv(
      env.SONAR_DEFAULT_OVERVIEW_ITEMS,
      [...DEFAULT_OVERVIEW_ITEMS],
      OVERVIEW_ITEM_VALUES,
      "SONAR_DEFAULT_OVERVIEW_ITEMS"
    )
  };
}

/**
 * 解析正整数配置项。
 *
 * @param value - 原始环境变量值。
 * @param fallback - 缺失时使用的默认值。
 * @param key - 配置键名，用于错误提示。
 * @returns 解析后的正整数。
 * @throws {SonarQubeMcpError} 当值存在但不是正整数时抛出。
 */
function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  key: string
): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SonarQubeMcpError("CONFIG", `${key} 必须是正整数，当前值为 "${value}"。`);
  }

  return parsed;
}

/**
 * 解析非负整数配置项。
 *
 * @param value - 原始环境变量值。
 * @param fallback - 缺失时使用的默认值。
 * @param key - 配置键名，用于错误提示。
 * @returns 解析后的非负整数。
 * @throws {SonarQubeMcpError} 当值存在但不是非负整数时抛出。
 */
function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
  key: string
): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new SonarQubeMcpError("CONFIG", `${key} 必须是非负整数，当前值为 "${value}"。`);
  }

  return parsed;
}

/**
 * 校验可选代理地址，目前仅支持 http/https。
 *
 * @param value - 原始环境变量值。
 * @param key - 配置键名，用于错误提示。
 * @returns 规范化后的代理地址；如果未配置则返回 `null`。
 * @throws {SonarQubeMcpError} 当代理地址不是合法的 http/https URL 时抛出。
 */
function parseOptionalProxyUrl(
  value: string | undefined,
  key: string
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (error) {
    throw new SonarQubeMcpError("CONFIG", `${key} 不是合法 URL: "${trimmed}"。`, {
      cause: error
    });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SonarQubeMcpError(
      "CONFIG",
      `${key} 目前只支持 http/https 代理，当前协议为 "${url.protocol}"。`
    );
  }

  return url.toString();
}

/**
 * 解析逗号分隔的枚举环境变量。
 *
 * @param value - 原始环境变量值。
 * @param fallback - 未配置时使用的默认值。
 * @param allowedValues - 允许的枚举集合。
 * @param key - 配置键名，用于错误提示。
 * @returns 去重并校验后的枚举数组。
 *
 * @throws {SonarQubeMcpError}
 * 当环境变量已配置，但解析后为空或包含未支持的值时抛出。
 */
function parseEnumCsvEnv<TValue extends string>(
  value: string | undefined,
  fallback: TValue[],
  allowedValues: readonly TValue[],
  key: string
): TValue[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsedValues = [...new Set(trimmed.split(",").map((item) => item.trim()).filter(Boolean))];
  if (!parsedValues.length) {
    throw new SonarQubeMcpError(
      "CONFIG",
      `${key} 不能为空，允许值为: ${allowedValues.join(", ")}。`
    );
  }

  return parsedValues.map((item) => {
    if (!allowedValues.includes(item as TValue)) {
      throw new SonarQubeMcpError(
        "CONFIG",
        `${key} 只能包含以下值: ${allowedValues.join(", ")}；当前值包含 "${item}"。`
      );
    }

    return item as TValue;
  });
}

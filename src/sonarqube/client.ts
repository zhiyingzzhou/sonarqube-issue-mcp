import { Buffer } from "node:buffer";
import { ProxyAgent } from "undici";

import { SonarQubeMcpError } from "../errors.js";
import { withProjectContext } from "../project-ref.js";
import type {
  ImpactSeverity,
  IssueStatus,
  IssueType,
  ProjectLocator,
  SoftwareQuality
} from "../types.js";
import type {
  SonarComponentShowResponse,
  SonarComponentsTreeResponse,
  SonarHotspotSearchResponse,
  SonarHotspotShowResponse,
  SonarIssue,
  SonarIssueChangelogResponse,
  SonarIssueRuleSummary,
  SonarIssueSearchResponse,
  SonarMeasuresComponentResponse,
  SonarProjectComponent,
  SonarQualityGateProjectStatusResponse,
  SonarRuleDetailsResponse
} from "./api-types.js";

/**
 * SonarQube HTTP client 的运行参数。
 *
 * @remarks
 * 这里仅包含请求层所需配置，不引入任何业务语义字段。
 */
export interface SonarQubeClientOptions {
  /** SonarQube Basic Auth 使用的 token。 */
  token: string;
  /** 单次请求超时时间，单位毫秒。 */
  requestTimeoutMs: number;
  /** 最大重试次数。 */
  retryCount: number;
  /** 当前项目请求使用的可选代理。 */
  httpProxy: string | null;
}

/**
 * `/api/hotspots/search` 的请求参数。
 *
 * @remarks
 * 项目、分支、PR 上下文由 `projectRef` 统一透传，这里只保留 action 自身的查询参数。
 */
export interface SonarHotspotSearchOptions {
  /** Hotspot 状态；对应官方参数 `status`。 */
  status?: string;
  /** Hotspot 处理结论；对应官方参数 `resolution`。 */
  resolution?: string;
  /** 文件组件 key 列表；对应官方参数 `files`。 */
  files?: string[];
  /** Hotspot key 列表；对应官方参数 `hotspots`。 */
  hotspots?: string[];
  /** 是否只返回当前用户负责的 Hotspot；对应官方参数 `onlyMine`。 */
  onlyMine?: boolean | null;
  /** 是否仅返回新代码周期内的 Hotspot；对应官方参数 `inNewCodePeriod`。 */
  inNewCodePeriod?: boolean | null;
  /** 当前页码；对应官方参数 `p`。 */
  page: number;
  /** 当前页大小；对应官方参数 `ps`。 */
  pageSize: number;
}

/**
 * `/api/issues/search` 的请求参数。
 *
 * @remarks
 * 这里只暴露当前仍建议使用的公开筛选项。
 * 10.4 起 deprecated 的 `statuses` / `resolutions` 不再进入 MCP 协议。
 */
export interface SonarIssueSearchOptions {
  /** issue 类型列表；对应官方参数 `types`。 */
  types: IssueType[];
  /** 软件质量维度过滤；对应官方参数 `impactSoftwareQualities`。 */
  impactSoftwareQualities: SoftwareQuality[];
  /** 现行 issue 状态列表；对应官方参数 `issueStatuses`。 */
  issueStatuses: IssueStatus[];
  /** 官方 impact 严重度过滤；对应官方参数 `impactSeverities`。 */
  impactSeverities: ImpactSeverity[];
  /** 是否仅返回已解决或未解决 issue；对应官方参数 `resolved`。 */
  resolved: boolean | null;
  /** 当前页码；对应官方参数 `p`。 */
  page: number;
  /** 当前页大小；对应官方参数 `ps`。 */
  pageSize: number;
}

/**
 * `/api/components/tree` 的请求参数。
 *
 * @remarks
 * 当前字段直接映射官方接口里已核对过的公开参数。
 */
export interface SonarComponentsTreeOptions {
  /** 遍历起点组件 key；对应官方参数 `component`。 */
  componentKey: string;
  /** 遍历策略；对应官方参数 `strategy`。 */
  strategy: string;
  /** 组件限定符过滤列表；对应官方参数 `qualifiers`。 */
  qualifiers: string[];
  /** 关键字过滤；对应官方参数 `q`。 */
  query: string | null;
  /** 排序字段列表；对应官方参数 `s`。 */
  sortFields: string[];
  /** 是否升序；对应官方参数 `asc`。 */
  asc: boolean;
  /** 当前页码；对应官方参数 `p`。 */
  page: number;
  /** 当前页大小；对应官方参数 `ps`。 */
  pageSize: number;
}

/**
 * 按代理地址缓存 `ProxyAgent`，避免重复构造连接器。
 *
 * @remarks
 * 同一个进程内多个项目查询可复用同一代理配置。
 */
const proxyAgentCache = new Map<string, ProxyAgent>();

/**
 * SonarQube Web API 访问层。
 *
 * @remarks
 * 这一层只做“请求、分页、鉴权、错误映射、轻量缓存”，不承担业务标准化职责。
 */
export class SonarQubeClient {
  /** 规则详情缓存，避免列表和详情阶段重复拉取同一 rule。 */
  private readonly ruleCache = new Map<string, SonarIssueRuleSummary>();
  private readonly dispatcher: ProxyAgent | null;

  constructor(
    private readonly projectRef: ProjectLocator,
    private readonly options: SonarQubeClientOptions
  ) {
    this.dispatcher = getDispatcher(options.httpProxy);
  }

  /**
   * 获取 SonarQube 服务版本，用于预检和调试输出。
   *
   * @returns SonarQube 版本字符串。
   * @throws {SonarQubeMcpError} 当请求失败时抛出。
   */
  async getServerVersion(): Promise<string> {
    return this.requestText("/api/server/version");
  }

  /**
   * 校验并读取项目组件基础信息。
   *
   * @returns 项目组件信息。
   * @throws {SonarQubeMcpError} 当项目不存在或无法访问时抛出。
   */
  async getProjectComponent(): Promise<SonarComponentShowResponse["component"]> {
    const searchParams = withProjectContext(
      new URLSearchParams({
        component: this.projectRef.projectKey
      }),
      this.projectRef
    );

    const response = await this.requestJson<SonarComponentShowResponse>(
      "/api/components/show",
      searchParams
    );
    return response.component;
  }

  /**
   * 获取项目质量门禁状态。
   *
   * @returns 质量门禁响应主体。
   * @throws {SonarQubeMcpError} 当请求失败或响应异常时抛出。
   */
  async getProjectQualityGate(): Promise<SonarQualityGateProjectStatusResponse["projectStatus"]> {
    const searchParams = withProjectContext(
      new URLSearchParams({
        projectKey: this.projectRef.projectKey
      }),
      this.projectRef
    );

    const response = await this.requestJson<SonarQualityGateProjectStatusResponse>(
      "/api/qualitygates/project_status",
      searchParams
    );
    return response.projectStatus;
  }

  /**
   * 获取项目指标。
   *
   * @param metricKeys - 要查询的指标 key 列表。
   * @returns 组件与指标结果。
   * @throws {SonarQubeMcpError} 当请求失败或响应异常时抛出。
   */
  async getProjectMeasures(metricKeys: string[]): Promise<SonarMeasuresComponentResponse["component"]> {
    const searchParams = withProjectContext(
      new URLSearchParams({
        component: this.projectRef.projectKey,
        metricKeys: metricKeys.join(",")
      }),
      this.projectRef
    );

    const response = await this.requestJson<SonarMeasuresComponentResponse>(
      "/api/measures/component",
      searchParams
    );
    return response.component;
  }

  /**
   * 拉取指定软件质量维度下全部“当前未解决” issue。
   *
   * @param softwareQuality - 软件质量维度，对应官方 `impactSoftwareQualities`。
   * @returns 问题列表以及列表接口内嵌的规则摘要缓存。
   *
   * @remarks
   * 当前 MCP 口径固定为：
   * - Security: `impactSoftwareQualities=SECURITY + resolved=false`
   * - Reliability: `impactSoftwareQualities=RELIABILITY + resolved=false`
   * - Maintainability: `impactSoftwareQualities=MAINTAINABILITY + resolved=false`
   *
   * @throws {SonarQubeMcpError} 当请求失败或响应异常时抛出。
   */
  async searchOpenIssuesBySoftwareQuality(
    softwareQuality: SoftwareQuality
  ): Promise<{ issues: SonarIssue[]; embeddedRules: Map<string, SonarIssueRuleSummary> }> {
    const issues: SonarIssue[] = [];
    const embeddedRules = new Map<string, SonarIssueRuleSummary>();
    let page = 1;

    while (true) {
      const searchParams = withProjectContext(
        new URLSearchParams({
          components: this.projectRef.projectKey,
          impactSoftwareQualities: softwareQuality,
          resolved: "false",
          additionalFields: "_all",
          ps: "500",
          p: String(page)
        }),
        this.projectRef
      );

      const response = await this.requestJson<SonarIssueSearchResponse>(
        "/api/issues/search",
        searchParams
      );

      issues.push(...response.issues);
      // 列表接口会内嵌一部分 rule 摘要，先缓存起来，后续如缺详细描述再补全。
      for (const rule of response.rules ?? []) {
        embeddedRules.set(rule.key, rule);
        this.ruleCache.set(rule.key, rule);
      }

      if (issues.length >= response.paging.total) {
        break;
      }

      page += 1;
    }

    return { issues, embeddedRules };
  }

  /**
   * 按过滤条件搜索 issue，返回单页结果。
   *
   * @param options - 搜索参数。
   * @returns issue 列表、分页信息与内嵌规则摘要。
   * @throws {SonarQubeMcpError} 当请求失败或响应异常时抛出。
   */
  async searchIssues(options: SonarIssueSearchOptions): Promise<{
    issues: SonarIssue[];
    embeddedRules: Map<string, SonarIssueRuleSummary>;
    total: number;
  }> {
    const searchParams = withProjectContext(
      new URLSearchParams({
        components: this.projectRef.projectKey,
        additionalFields: "_all",
        ps: String(options.pageSize),
        p: String(options.page)
      }),
      this.projectRef
    );

    if (options.types.length) {
      searchParams.set("types", options.types.join(","));
    }

    if (options.impactSoftwareQualities.length) {
      searchParams.set(
        "impactSoftwareQualities",
        options.impactSoftwareQualities.join(",")
      );
    }

    if (options.issueStatuses.length) {
      searchParams.set("issueStatuses", options.issueStatuses.join(","));
    }

    if (options.impactSeverities.length) {
      searchParams.set("impactSeverities", options.impactSeverities.join(","));
    }

    if (options.resolved !== null) {
      searchParams.set("resolved", String(options.resolved));
    }

    const response = await this.requestJson<SonarIssueSearchResponse>(
      "/api/issues/search",
      searchParams
    );

    const embeddedRules = new Map<string, SonarIssueRuleSummary>();
    for (const rule of response.rules ?? []) {
      embeddedRules.set(rule.key, rule);
      this.ruleCache.set(rule.key, rule);
    }

    return {
      issues: response.issues,
      embeddedRules,
      total: response.paging.total
    };
  }

  /**
   * 通过 issue key 获取单条 issue。
   *
   * @param issueKey - SonarQube issue key。
   * @returns 单条 issue 及其可能内嵌的规则摘要。
   * @throws {SonarQubeMcpError} 当 issue 不存在或请求失败时抛出。
   */
  async getIssueByKey(issueKey: string): Promise<{ issue: SonarIssue; embeddedRule: SonarIssueRuleSummary | null }> {
    const searchParams = withProjectContext(
      new URLSearchParams({
        issues: issueKey,
        additionalFields: "_all"
      }),
      this.projectRef
    );

    const response = await this.requestJson<SonarIssueSearchResponse>(
      "/api/issues/search",
      searchParams
    );

    const issue = response.issues[0];
    if (!issue) {
      throw new SonarQubeMcpError("NOT_FOUND", `未找到 issue: ${issueKey}`, {
        status: 404
      });
    }

    const embeddedRule = response.rules?.find((rule) => rule.key === issue.rule) ?? null;
    if (embeddedRule) {
      this.ruleCache.set(embeddedRule.key, embeddedRule);
    }

    return { issue, embeddedRule };
  }

  /**
   * 获取单条 issue 的 changelog。
   *
   * @param issueKey - SonarQube issue key。
   * @returns changelog 数组。
   * @throws {SonarQubeMcpError} 当请求失败时抛出。
   */
  async getIssueChangelog(issueKey: string): Promise<unknown[]> {
    const response = await this.requestJson<SonarIssueChangelogResponse>(
      "/api/issues/changelog",
      new URLSearchParams({ issue: issueKey })
    );

    return response.changelog;
  }

  /**
   * 拉取全部待复核的 Security Hotspots。
   *
   * @returns hotspot 摘要列表。
   * @throws {SonarQubeMcpError} 当请求失败或响应异常时抛出。
   */
  async searchOpenHotspots(): Promise<SonarHotspotSearchResponse["hotspots"]> {
    const hotspots = [];
    let page = 1;

    while (true) {
      const searchParams = withProjectContext(
        new URLSearchParams({
          project: this.projectRef.projectKey,
          status: "TO_REVIEW",
          ps: "500",
          p: String(page)
        }),
        this.projectRef
      );

      const response = await this.requestJson<SonarHotspotSearchResponse>(
        "/api/hotspots/search",
        searchParams
      );

      hotspots.push(...response.hotspots);
      if (hotspots.length >= response.paging.total) {
        break;
      }

      page += 1;
    }

    return hotspots;
  }

  /**
   * 按过滤条件搜索 Hotspot，返回单页结果。
   *
   * @param options - 搜索参数。
   * @returns Hotspot 列表、组件补充信息与总数。
   * @throws {SonarQubeMcpError} 当请求失败或响应异常时抛出。
   */
  async searchHotspots(options: SonarHotspotSearchOptions): Promise<{
    hotspots: SonarHotspotSearchResponse["hotspots"];
    components: SonarProjectComponent[];
    total: number;
  }> {
    const searchParams = withProjectContext(
      new URLSearchParams({
        project: this.projectRef.projectKey,
        ps: String(options.pageSize),
        p: String(options.page)
      }),
      this.projectRef
    );

    if (options.status) {
      searchParams.set("status", options.status);
    }

    if (options.resolution) {
      searchParams.set("resolution", options.resolution);
    }

    if (options.files?.length) {
      searchParams.set("files", options.files.join(","));
    }

    if (options.hotspots?.length) {
      searchParams.set("hotspots", options.hotspots.join(","));
    }

    if (typeof options.onlyMine === "boolean") {
      searchParams.set("onlyMine", String(options.onlyMine));
    }

    if (typeof options.inNewCodePeriod === "boolean") {
      searchParams.set("inNewCodePeriod", String(options.inNewCodePeriod));
    }

    const response = await this.requestJson<SonarHotspotSearchResponse>(
      "/api/hotspots/search",
      searchParams
    );

    return {
      hotspots: response.hotspots,
      components: response.components ?? [],
      total: response.paging.total
    };
  }

  /**
   * 按 key 获取单条 hotspot 详情。
   *
   * @param hotspotKey - SonarQube hotspot key。
   * @returns hotspot 详情。
   * @throws {SonarQubeMcpError} 当请求失败时抛出。
   */
  async getHotspotDetail(hotspotKey: string): Promise<SonarHotspotShowResponse> {
    return this.requestJson<SonarHotspotShowResponse>(
      "/api/hotspots/show",
      new URLSearchParams({ hotspot: hotspotKey })
    );
  }

  /**
   * 获取组件树的单页结果。
   *
   * @param options - 组件树遍历参数。
   * @returns 组件树响应主体。
   * @throws {SonarQubeMcpError} 当请求失败或响应异常时抛出。
   */
  async getComponentsTree(
    options: SonarComponentsTreeOptions
  ): Promise<SonarComponentsTreeResponse> {
    const searchParams = withProjectContext(
      new URLSearchParams({
        component: options.componentKey,
        strategy: options.strategy,
        asc: String(options.asc),
        ps: String(options.pageSize),
        p: String(options.page)
      }),
      this.projectRef
    );

    if (options.qualifiers.length) {
      searchParams.set("qualifiers", options.qualifiers.join(","));
    }

    if (options.query) {
      searchParams.set("q", options.query);
    }

    if (options.sortFields.length) {
      searchParams.set("s", options.sortFields.join(","));
    }

    return this.requestJson<SonarComponentsTreeResponse>(
      "/api/components/tree",
      searchParams
    );
  }

  /**
   * 获取规则详情。
   *
   * @param ruleKey - SonarQube 规则 key。
   * @returns 规则详情或合并后的完整规则摘要。
   *
   * @remarks
   * 如果缓存里已有完整描述，则直接复用；否则继续调用 `/api/rules/show` 补全。
   *
   * @throws {SonarQubeMcpError} 当请求失败时抛出。
   */
  async getRule(ruleKey: string): Promise<SonarIssueRuleSummary> {
    const cached = this.ruleCache.get(ruleKey);
    if (cached?.name && hasRuleDescription(cached)) {
      return cached;
    }

    const response = await this.requestJson<SonarRuleDetailsResponse>(
      "/api/rules/show",
      new URLSearchParams({ key: ruleKey })
    );

    const mergedRule = {
      ...cached,
      ...response.rule
    };

    this.ruleCache.set(ruleKey, mergedRule);
    return mergedRule;
  }

  /**
   * 请求 JSON 接口并完成解析。
   *
   * @param path - API 路径。
   * @param searchParams - 可选查询参数。
   * @returns 解析后的 JSON 结构。
   */
  private async requestJson<T>(path: string, searchParams?: URLSearchParams): Promise<T> {
    const response = await this.request(path, searchParams);
    return this.parseJson<T>(response, path);
  }

  /**
   * 请求纯文本接口。
   *
   * @param path - API 路径。
   * @param searchParams - 可选查询参数。
   * @returns 去首尾空白后的文本响应。
   */
  private async requestText(path: string, searchParams?: URLSearchParams): Promise<string> {
    const response = await this.request(path, searchParams);
    return (await response.text()).trim();
  }

  /**
   * 底层 HTTP 请求封装。
   *
   * @param path - API 路径。
   * @param searchParams - 可选查询参数。
   * @returns 成功的原始 `Response` 对象。
   *
   * @remarks
   * 这里统一处理：
   * - Basic token 鉴权
   * - 可选 HTTP 代理
   * - 超时控制
   * - 可重试状态码
   * - SonarQube 错误映射
   *
   * @throws {SonarQubeMcpError} 当请求最终失败时抛出。
   */
  private async request(path: string, searchParams?: URLSearchParams): Promise<Response> {
    const url = new URL(path, this.projectRef.origin);
    if (searchParams) {
      url.search = searchParams.toString();
    }

    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);

      try {
        const requestInit: RequestInit = {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`${this.options.token}:`).toString("base64")}`
          },
          signal: controller.signal
        };

        // Node 内置 fetch 的 dispatcher 类型与直接引入的 undici 类型并不完全一致，
        // 这里在调用点做收口，避免把类型耦合扩散到外部代码。
        const response = await fetch(
          url,
          (
            this.dispatcher
              ? {
                  ...requestInit,
                  dispatcher: this.dispatcher
                }
              : requestInit
          ) as RequestInit
        );

        clearTimeout(timeout);

        if (response.ok) {
          return response;
        }

        const error = await this.buildHttpError(response, url.toString());
        if (this.shouldRetry(response.status, attempt)) {
          attempt += 1;
          continue;
        }

        throw error;
      } catch (error) {
        clearTimeout(timeout);

        if (error instanceof SonarQubeMcpError) {
          throw error;
        }

        if (this.shouldRetryForException(error, attempt)) {
          attempt += 1;
          continue;
        }

        throw new SonarQubeMcpError("NETWORK", `请求 SonarQube 失败: ${url}`, {
          cause: error
        });
      }
    }
  }

  /**
   * 判断当前 HTTP 状态是否值得重试。
   *
   * @param status - HTTP 状态码。
   * @param attempt - 当前已重试次数。
   * @returns 是否继续重试。
   */
  private shouldRetry(status: number, attempt: number): boolean {
    if (attempt >= this.options.retryCount) {
      return false;
    }

    return status === 408 || status === 429 || status === 502 || status === 504;
  }

  /**
   * 判断当前异常是否属于可重试的网络层失败。
   *
   * @param error - 原始异常。
   * @param attempt - 当前已重试次数。
   * @returns 是否继续重试。
   */
  private shouldRetryForException(error: unknown, attempt: number): boolean {
    if (attempt >= this.options.retryCount) {
      return false;
    }

    return error instanceof Error && error.name !== "AbortError";
  }

  /**
   * 将 HTTP 错误响应映射为统一的 MCP 错误类型。
   *
   * @param response - 失败的 HTTP 响应。
   * @param requestUrl - 便于排查的完整请求地址。
   * @returns 统一错误对象。
   */
  private async buildHttpError(response: Response, requestUrl: string): Promise<SonarQubeMcpError> {
    const payload = await this.parseErrorPayload(response);
    const message = payload.message || `SonarQube 返回了错误响应: ${response.status}`;

    if (response.status === 401) {
      return new SonarQubeMcpError("AUTH", message, {
        status: response.status,
        details: payload.details
      });
    }

    if (response.status === 403) {
      return new SonarQubeMcpError("FORBIDDEN", message, {
        status: response.status,
        details: payload.details
      });
    }

    if (response.status === 404) {
      return new SonarQubeMcpError("NOT_FOUND", message, {
        status: response.status,
        details: payload.details
      });
    }

    if (response.status === 503) {
      return new SonarQubeMcpError(
        "INDEXING",
        `SonarQube 当前不可用或仍在重建索引，请稍后重试。请求地址: ${requestUrl}`,
        {
          status: response.status,
          details: payload.details
        }
      );
    }

    return new SonarQubeMcpError("REMOTE", message, {
      status: response.status,
      details: payload.details
    });
  }

  /**
   * 解析 SonarQube JSON 响应，并在结构不合法时抛出统一错误。
   *
   * @param response - 原始 HTTP 响应。
   * @param path - 当前请求路径，仅用于错误提示。
   * @returns 解析后的 JSON 结构。
   * @throws {SonarQubeMcpError} 当响应不是合法 JSON 时抛出。
   */
  private async parseJson<T>(response: Response, path: string): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new SonarQubeMcpError("REMOTE", `SonarQube 返回了无法解析的 JSON: ${path}`, {
        cause: error
      });
    }
  }

  /**
   * 尽量把 SonarQube 的错误体提炼成稳定 message + details 结构。
   *
   * @param response - 原始 HTTP 响应。
   * @returns 规范化后的错误 message 与 details。
   */
  private async parseErrorPayload(
    response: Response
  ): Promise<{ message: string; details: unknown }> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      try {
        const json = (await response.json()) as {
          errors?: Array<{ msg?: string }>;
          [key: string]: unknown;
        };
        const message =
          json.errors?.map((item) => item.msg).filter(Boolean).join("; ") ||
          response.statusText ||
          "请求失败";

        return {
          message,
          details: json
        };
      } catch {
        return {
          message: response.statusText || "请求失败",
          details: null
        };
      }
    }

    const text = (await response.text()).trim();
    return {
      message: text || response.statusText || "请求失败",
      details: text || null
    };
  }
}

/**
 * 复用同一代理地址的 ProxyAgent，减少连接开销。
 *
 * @param httpProxy - 代理地址。
 * @returns 对应的 `ProxyAgent`；如果未配置代理则返回 `null`。
 */
function getDispatcher(httpProxy: string | null): ProxyAgent | null {
  if (!httpProxy) {
    return null;
  }

  const cached = proxyAgentCache.get(httpProxy);
  if (cached) {
    return cached;
  }

  const dispatcher = new ProxyAgent(httpProxy);
  proxyAgentCache.set(httpProxy, dispatcher);
  return dispatcher;
}

/**
 * 判断规则缓存里是否已经带有可展示的描述内容。
 *
 * @param rule - 当前缓存中的规则摘要。
 * @returns 是否可直接复用，而不必再次请求 `/api/rules/show`。
 */
function hasRuleDescription(rule: SonarIssueRuleSummary | undefined): boolean {
  if (!rule) {
    return false;
  }

  return Boolean(
    rule.descriptionSections?.some((section) => section.content.trim()) ||
      rule.mdDesc ||
      rule.htmlDesc
  );
}

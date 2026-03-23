import { SonarQubeMcpError } from "./errors.js";
import type { ProjectLocator, ProjectUrlInput } from "./types.js";

/**
 * 解析并校验 SonarQube 项目 URL。
 *
 * @param projectUrl - 用户传入的 SonarQube 页面 URL。
 * @returns 规范化后的项目上下文。
 *
 * @remarks
 * 当前接受任意带 `id` 查询参数的 SonarQube 项目页面 URL，
 * 例如 dashboard、overview、issues、security hotspots 页面。
 * 额外查询参数会被忽略，仅提取：
 * - `origin`
 * - `id -> projectKey`
 * - `branch`
 * - `pullRequest`
 *
 * @throws {SonarQubeMcpError}
 * 当 URL 非法、协议不支持或缺少项目 key 时抛出。
 */
export function parseProjectUrl(projectUrl: ProjectUrlInput): ProjectLocator {
  let url: URL;
  try {
    url = new URL(projectUrl);
  } catch (error) {
    throw new SonarQubeMcpError("VALIDATION", `projectUrl 不是合法 URL: ${projectUrl}`, {
      cause: error
    });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SonarQubeMcpError(
      "VALIDATION",
      `projectUrl 必须使用 http 或 https 协议: ${projectUrl}`
    );
  }

  const projectKey = url.searchParams.get("id")?.trim() || "";
  if (!projectKey) {
    throw new SonarQubeMcpError(
      "VALIDATION",
      "projectUrl 必须包含 SonarQube 项目标识参数 id。"
    );
  }

  return {
    origin: url.origin,
    projectKey,
    branch: url.searchParams.get("branch")?.trim() || null,
    pullRequest: url.searchParams.get("pullRequest")?.trim() || null
  };
}

/**
 * 将 branch / pullRequest 上下文透传到任意 SonarQube API 查询参数中。
 *
 * @param searchParams - 已有查询参数。
 * @param projectLocator - 解析后的项目上下文。
 * @returns 追加了分支/PR 上下文的新查询参数对象。
 */
export function withProjectContext(
  searchParams: URLSearchParams,
  projectLocator: ProjectLocator
): URLSearchParams {
  const next = new URLSearchParams(searchParams);

  if (projectLocator.branch) {
    next.set("branch", projectLocator.branch);
  }

  if (projectLocator.pullRequest) {
    next.set("pullRequest", projectLocator.pullRequest);
  }

  return next;
}

/**
 * 构造项目级 SonarQube 浏览深链。
 *
 * @param projectLocator - 解析后的项目上下文。
 * @returns 指向项目 dashboard 的可点击链接。
 */
export function buildProjectBrowseUrl(projectLocator: ProjectLocator): string {
  const url = new URL("/dashboard", projectLocator.origin);
  url.searchParams.set("id", projectLocator.projectKey);

  if (projectLocator.branch) {
    url.searchParams.set("branch", projectLocator.branch);
  }

  if (projectLocator.pullRequest) {
    url.searchParams.set("pullRequest", projectLocator.pullRequest);
  }

  return url.toString();
}

/**
 * 构造单条 issue 的 SonarQube 页面深链。
 *
 * @param projectLocator - 解析后的项目上下文。
 * @param issueKey - SonarQube issue key。
 * @returns 指向 issue 详情面板的可点击链接。
 */
export function buildIssueBrowseUrl(projectLocator: ProjectLocator, issueKey: string): string {
  const url = new URL("/project/issues", projectLocator.origin);
  url.searchParams.set("id", projectLocator.projectKey);
  url.searchParams.set("open", issueKey);

  if (projectLocator.branch) {
    url.searchParams.set("branch", projectLocator.branch);
  }

  if (projectLocator.pullRequest) {
    url.searchParams.set("pullRequest", projectLocator.pullRequest);
  }

  return url.toString();
}

/**
 * 构造单条 security hotspot 的 SonarQube 页面深链。
 *
 * @param projectLocator - 解析后的项目上下文。
 * @param hotspotKey - SonarQube hotspot key。
 * @returns 指向 hotspot 详情面板的可点击链接。
 */
export function buildHotspotBrowseUrl(
  projectLocator: ProjectLocator,
  hotspotKey: string
): string {
  const url = new URL("/security_hotspots", projectLocator.origin);
  url.searchParams.set("id", projectLocator.projectKey);
  url.searchParams.set("hotspots", hotspotKey);

  if (projectLocator.branch) {
    url.searchParams.set("branch", projectLocator.branch);
  }

  if (projectLocator.pullRequest) {
    url.searchParams.set("pullRequest", projectLocator.pullRequest);
  }

  return url.toString();
}

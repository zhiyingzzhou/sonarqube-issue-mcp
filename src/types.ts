/**
 * 控制返回结果是否补充规则说明等重字段。
 *
 * @remarks
 * - `standard`: 只返回常规排查字段
 * - `full`: 额外返回规则描述、修复建议等扩展字段
 */
export const DETAIL_LEVEL_VALUES = ["standard", "full"] as const;

/**
 * 控制返回结果是否补充规则说明等重字段。
 */
export type DetailLevel = (typeof DETAIL_LEVEL_VALUES)[number];

/**
 * MCP 详情查询目前支持的实体类型。
 *
 * @remarks
 * `issue` 对应 SonarQube 的常规 issue，`hotspot` 对应 Security Hotspot。
 */
export const FINDING_KIND_VALUES = ["issue", "hotspot"] as const;

/**
 * MCP 详情查询目前支持的实体类型。
 */
export type FindingKind = (typeof FINDING_KIND_VALUES)[number];

/**
 * `/api/issues/search.impactSoftwareQualities` 当前公开的软件质量维度枚举。
 *
 * @remarks
 * 这里直接对齐 SonarQube 最新公开 Web API 枚举。
 */
export const SOFTWARE_QUALITY_VALUES = [
  "SECURITY",
  "RELIABILITY",
  "MAINTAINABILITY"
] as const;

/**
 * `/api/issues/search.impactSoftwareQualities` 当前公开的软件质量维度枚举。
 */
export type SoftwareQuality = (typeof SOFTWARE_QUALITY_VALUES)[number];

/**
 * MCP 输出侧用于组织 findings 列表的稳定分类。
 *
 * @remarks
 * 这里不再沿用旧 `BUG / VULNERABILITY / CODE_SMELL` 类型分桶，
 * 而是改为对齐最新 SonarQube 软件质量维度与独立 Hotspot 通道：
 * - `security`
 * - `reliability`
 * - `maintainability`
 * - `security-hotspot`
 */
export const FINDING_CATEGORY_VALUES = [
  "security",
  "reliability",
  "maintainability",
  "security-hotspot"
] as const;

/**
 * MCP 输出侧用于组织 findings 列表的稳定分类。
 */
export type FindingCategory = (typeof FINDING_CATEGORY_VALUES)[number];

/**
 * findings 列表工具的默认分类。
 *
 * @remarks
 * 默认只抓当前最常见、最需要优先处理的三类：
 * Security、Reliability、Security Hotspot。
 */
export const DEFAULT_FINDING_CATEGORIES = [
  "security",
  "reliability",
  "security-hotspot"
] as const satisfies readonly FindingCategory[];

/**
 * overview 工具支持的总览项 key。
 *
 * @remarks
 * 这 7 项对齐 SonarQube 总览/报告语义，不再误称为 issue type。
 */
export const OVERVIEW_ITEM_VALUES = [
  "security",
  "reliability",
  "maintainability",
  "accepted-issues",
  "coverage",
  "duplications",
  "security-hotspots"
] as const;

/**
 * overview 工具支持的总览项 key。
 */
export type OverviewItemKey = (typeof OVERVIEW_ITEM_VALUES)[number];

/**
 * overview 工具的默认总览项集合。
 *
 * @remarks
 * 默认返回全部 7 项，总览工具不再像 findings 一样只返回问题列表子集。
 */
export const DEFAULT_OVERVIEW_ITEMS = [...OVERVIEW_ITEM_VALUES] as const;

/**
 * MCP 输入侧的 SonarQube 项目 URL。
 *
 * @remarks
 * 对外协议层现在只接受单个页面 URL，
 * 解析层会自动抽出 `origin / projectKey / branch / pullRequest`。
 */
export type ProjectUrlInput = string;

/**
 * 经过校验和规范化后的项目定位信息。
 *
 * @remarks
 * 这是后续所有 SonarQube API 请求共享的上下文载体。
 */
export interface ProjectLocator {
  /** SonarQube 服务根地址，例如 `https://sonarqube.example.com`。 */
  origin: string;
  /** 项目标识，对应 SonarQube project key。 */
  projectKey: string;
  /** 当前查询绑定的分支。 */
  branch: string | null;
  /** 当前查询绑定的 PR。 */
  pullRequest: string | null;
}

/**
 * SonarQube 返回的行列范围信息。
 *
 * @remarks
 * 与编辑器中的高亮区间或 Sonar 页面中的定位区域一一对应。
 */
export interface TextRange {
  /** 高亮区域起始行号。 */
  startLine: number;
  /** 高亮区域结束行号。 */
  endLine: number;
  /** 起始列偏移。 */
  startOffset: number;
  /** 结束列偏移。 */
  endOffset: number;
}

/**
 * SonarQube 新版 issue impacts 字段中的单条影响描述。
 *
 * @remarks
 * 新版规则/问题模型会用 `softwareQuality + severity` 组合表达影响级别。
 */
export interface FindingImpact {
  /** 受影响的软件质量维度，例如 `SECURITY`。 */
  softwareQuality: string;
  /** 该质量维度下的严重程度。 */
  severity: string;
}

/**
 * 项目级基础信息，供 MCP 汇总和详情接口复用。
 *
 * @remarks
 * 这部分字段被设计成稳定结构，方便客户端直接缓存或展示。
 */
export interface ProjectInfo {
  /** SonarQube 服务根地址。 */
  origin: string;
  /** 项目 key。 */
  key: string;
  /** 项目名称。 */
  name: string;
  /** SonarQube 组件限定符，例如 `TRK`。 */
  qualifier: string | null;
  /** 当前查询绑定的分支。 */
  branch: string | null;
  /** 当前查询绑定的 PR。 */
  pullRequest: string | null;
  /** 标准化后的项目浏览链接。 */
  browseUrl: string;
  /** SonarQube 服务版本。 */
  serverVersion: string;
}

/**
 * MCP 对单条问题的统一摘要结构。
 *
 * @remarks
 * 这里刻意把 issue 与 hotspot 归一成一套字段，方便上层 LLM 或客户端统一消费。
 */
export interface FindingSummary {
  /** 问题唯一 key。 */
  key: string;
  /** 底层实体类型。 */
  kind: FindingKind;
  /** MCP 归一化后的业务分类。 */
  category: FindingCategory;
  /** SonarQube 规则 key。 */
  ruleKey: string;
  /** 规则展示名。 */
  ruleName: string | null;
  /** 问题主消息。 */
  message: string;
  /** 对外统一状态文本；issue 优先使用官方 `issueStatus`，Hotspot 直接使用 `status`。 */
  status: string;
  /** 当前处理结论；未设置时为空。 */
  resolution: string | null;
  /** 统一后的严重度。 */
  severity: string | null;
  /** Hotspot 风险概率。 */
  vulnerabilityProbability: string | null;
  /** 新版质量模型 impacts 列表。 */
  impacts: FindingImpact[];
  /** Clean Code 属性。 */
  cleanCodeAttribute: string | null;
  /** 相对文件路径。 */
  file: string | null;
  /** 问题所在行号。 */
  line: number | null;
  /** 更精细的文本范围。 */
  textRange: TextRange | null;
  /** 作者信息。 */
  author: string | null;
  /** 负责人信息。 */
  assignee: string | null;
  /** 规则或问题标签。 */
  tags: string[];
  /** 创建时间。 */
  createdAt: string;
  /** 最后更新时间。 */
  updatedAt: string;
  /** 指向 SonarQube 页面的深链。 */
  sonarUrl: string;
  /** 规则描述文本；优先来自 `/api/rules/show.descriptionSections`，匿名实例可能拿到混淆内容。 */
  ruleDescription: string | null;
  /** Hotspot 风险说明；来自 `/api/hotspots/show.rule.riskDescription`，官方自 9.5 起已标记 deprecated。 */
  riskDescription: string | null;
  /** Hotspot 修复建议；来自 `/api/hotspots/show.rule.fixRecommendations`，官方自 9.5 起已标记 deprecated。 */
  fixRecommendations: string | null;
  /** Hotspot 漏洞说明；来自 `/api/hotspots/show.rule.vulnerabilityDescription`，官方自 9.5 起已标记 deprecated。 */
  vulnerabilityDescription: string | null;
}

/**
 * 单个 findings 分桶结果。
 *
 * @remarks
 * `items` 已按服务层预定义排序规则完成排序，可直接展示。
 */
export interface FindingBucket {
  /** 当前分桶分类。 */
  category: FindingCategory;
  /** 适合直接展示的分类标题。 */
  label: string;
  /** 当前分桶内返回的条数。 */
  count: number;
  /** 当前分桶对应的问题列表。 */
  items: FindingSummary[];
}

/**
 * 项目级 findings 汇总统计信息。
 *
 * @remarks
 * `totalFindings` 是跨桶去重后的总数。
 * 之所以需要显式说明，是因为同一 issue 可能同时影响多个 software quality，
 * 因而会出现在多个分桶中。
 */
export interface ProjectFindingsSummary {
  /** 本次实际请求的分桶列表。 */
  requestedCategories: FindingCategory[];
  /** 跨桶去重后的 findings 总数。 */
  totalFindings: number;
  /** 当前结果生成时使用的详情级别。 */
  detailLevel: DetailLevel;
}

/**
 * `sonarqube_findings_list` 的结构化返回体。
 *
 * @remarks
 * 这里彻底改成动态 `buckets` 结构，不再维护固定三数组。
 */
export interface ProjectFindingsResult {
  /** 项目基础信息。 */
  project: ProjectInfo;
  /** 汇总信息。 */
  summary: ProjectFindingsSummary;
  /** 动态分桶后的问题列表。 */
  buckets: FindingBucket[];
}

/**
 * `sonarqube_finding_get` 的结构化返回体。
 *
 * @remarks
 * `raw` 保留底层 SonarQube 返回，便于出现歧义时做问题排查。
 */
export interface FindingDetail {
  /** 项目基础信息。 */
  project: ProjectInfo;
  /** 统一摘要。 */
  summary: FindingSummary;
  /** 问题评论；issue 与 hotspot 的原始结构不同，因此保留为原始数组。 */
  comments: unknown[];
  /** issue/hotspot 的历史变更记录。 */
  changelog: unknown[];
  /** SonarQube 提供的 execution/data flow。 */
  flows: unknown[];
  /** 调试与追查问题时使用的原始 API 返回。 */
  raw: unknown;
}

/**
 * 单条质量门禁条件。
 *
 * @remarks
 * 对应 SonarQube quality gate 中的单个判定项。
 */
export interface QualityGateCondition {
  /** 当前条件状态。 */
  status: string;
  /** 指标 key。 */
  metricKey: string;
  /** 比较器。 */
  comparator: string | null;
  /** 阈值。 */
  errorThreshold: string | null;
  /** 实际值。 */
  actualValue: string | null;
}

/**
 * 质量门禁周期信息。
 *
 * @remarks
 * SonarQube 会在基于新代码周期的门禁中返回这一块。
 */
export interface QualityGatePeriod {
  /** 周期模式。 */
  mode: string | null;
  /** 周期日期。 */
  date: string | null;
  /** 附加参数。 */
  parameter: string | null;
}

/**
 * `sonarqube_quality_gate_get` 的结构化返回体。
 */
export interface ProjectQualityGateResult {
  /** 项目基础信息。 */
  project: ProjectInfo;
  /** 质量门禁总体状态。 */
  status: string;
  /** 是否忽略部分条件。 */
  ignoredConditions: boolean;
  /** Clean as You Code 状态。 */
  caycStatus: string | null;
  /** 周期信息。 */
  period: QualityGatePeriod | null;
  /** 条件列表。 */
  conditions: QualityGateCondition[];
  /** 调试与追查问题时使用的原始 API 返回。 */
  raw: unknown;
}

/**
 * 单条项目指标值。
 *
 * @remarks
 * 保留 SonarQube 原始字符串值，避免过早推断数值类型。
 */
export interface ProjectMeasure {
  /** 指标 key。 */
  metric: string;
  /** 当前值。 */
  value: string | null;
  /** 是否最佳值。 */
  bestValue: boolean | null;
}

/**
 * `sonarqube_measures_get` 的结构化返回体。
 */
export interface ProjectMeasuresResult {
  /** 项目基础信息。 */
  project: ProjectInfo;
  /** 本次查询请求的指标 key 列表。 */
  metricKeys: string[];
  /** 指标值列表；服务层会按 `metricKeys` 请求顺序重排，避免依赖底层返回顺序。 */
  measures: ProjectMeasure[];
  /** 调试与追查问题时使用的原始 API 返回。 */
  raw: unknown;
}

/**
 * 单个 overview 项的结构化结果。
 *
 * @remarks
 * 当前统一映射到 SonarQube `/api/measures/component` 返回的单个 metric。
 */
export interface ProjectOverviewItem {
  /** 总览项 key。 */
  key: OverviewItemKey;
  /** 适合直接展示的标题。 */
  label: string;
  /** 当前总览项对应的 SonarQube metric key。 */
  metricKey: string;
  /** 指标原始值。 */
  value: string | null;
  /** 是否为最佳值；仅部分 metric 会返回。 */
  bestValue: boolean | null;
}

/**
 * `sonarqube_overview_get` 的结构化返回体。
 */
export interface ProjectOverviewResult {
  /** 项目基础信息。 */
  project: ProjectInfo;
  /** 本次请求的 overview 项列表。 */
  requestedItems: OverviewItemKey[];
  /** 逐项展开后的总览结果。 */
  items: ProjectOverviewItem[];
  /** 调试与追查问题时使用的原始 API 返回。 */
  raw: unknown;
}

/**
 * `/api/issues/search` 当前公开的 issue 类型枚举。
 */
export const ISSUE_TYPE_VALUES = ["BUG", "VULNERABILITY", "CODE_SMELL"] as const;

/**
 * `/api/issues/search` 当前公开的 issue 类型枚举。
 */
export type IssueType = (typeof ISSUE_TYPE_VALUES)[number];

/**
 * `/api/issues/search` 当前公开的 issue 状态枚举。
 *
 * @remarks
 * 这里对齐官方 `issueStatuses` 参数的现行取值。
 * 虽然 changelog 标记 `CONFIRMED` 为逐步弱化值，但它仍然出现在官方参数枚举里，因此当前仍接受。
 */
export const ISSUE_STATUS_VALUES = [
  "OPEN",
  "CONFIRMED",
  "FALSE_POSITIVE",
  "ACCEPTED",
  "FIXED",
  "IN_SANDBOX"
] as const;

/**
 * `/api/issues/search` 当前公开的 issue 状态枚举。
 */
export type IssueStatus = (typeof ISSUE_STATUS_VALUES)[number];

/**
 * `/api/issues/search` 当前公开的 impact 严重度枚举。
 *
 * @remarks
 * 这里对齐官方现行 `impactSeverities` 参数，
 * 与 issue 返回体 `impacts[].severity` 以及本 MCP 输出的统一 `severity` 语义保持一致。
 */
export const IMPACT_SEVERITY_VALUES = [
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "BLOCKER"
] as const;

/**
 * `/api/issues/search` 当前公开的 impact 严重度枚举。
 */
export type ImpactSeverity = (typeof IMPACT_SEVERITY_VALUES)[number];

/**
 * issues 搜索时使用的过滤条件。
 *
 * @remarks
 * 当前直接映射 `/api/issues/search` 的现行公开参数，
 * 不再暴露 10.4 起 deprecated 的 `statuses` / `resolutions` 过滤方式。
 */
export interface IssueSearchFilters {
  /** 原始 SonarQube issue 类型过滤；映射 `/api/issues/search.types`。 */
  types: IssueType[];
  /** 官方软件质量维度过滤；映射 `/api/issues/search.impactSoftwareQualities`。 */
  impactSoftwareQualities: SoftwareQuality[];
  /** 现行 issue 状态过滤；映射 `/api/issues/search.issueStatuses`。 */
  issueStatuses: IssueStatus[];
  /** impact 严重度过滤；映射 `/api/issues/search.impactSeverities`。 */
  impactSeverities: ImpactSeverity[];
  /** 是否已解决；为 `null` 时表示不按 resolved 过滤。 */
  resolved: boolean | null;
  /** 当前页码，从 1 开始。 */
  page: number;
  /** 当前页大小，受 SonarQube 接口 `ps` 上限约束。 */
  pageSize: number;
  /** 当前结果生成时使用的详情级别。 */
  detailLevel: DetailLevel;
}

/**
 * 通用 issue 搜索结果中的单条摘要。
 *
 * @remarks
 * 这里不再强行压成 findings 三分类，而是保留 SonarQube 原始 `type`。
 */
export interface IssueSearchItem {
  /** issue key。 */
  key: string;
  /** SonarQube 原始 issue 类型，例如 `BUG`、`VULNERABILITY`、`CODE_SMELL`。 */
  type: string | null;
  /** SonarQube 规则 key。 */
  ruleKey: string;
  /** 规则展示名。 */
  ruleName: string | null;
  /** 问题主消息。 */
  message: string;
  /** 对外统一状态文本；优先取官方 `issueStatus`，缺失时回退旧 `status`。 */
  status: string;
  /** 官方现行 issue 状态；直接来自 `/api/issues/search.issueStatus`。 */
  issueStatus: string | null;
  /** 当前处理结论；未设置时为空。 */
  resolution: string | null;
  /** 统一后的严重度；优先取 impacts 中最高等级，没有时回退旧 severity。 */
  severity: string | null;
  /** 新版质量影响列表。 */
  impacts: FindingImpact[];
  /** Clean Code 属性。 */
  cleanCodeAttribute: string | null;
  /** 相对文件路径。 */
  file: string | null;
  /** 问题所在行号。 */
  line: number | null;
  /** 更精细的文本范围。 */
  textRange: TextRange | null;
  /** 作者信息。 */
  author: string | null;
  /** 负责人信息。 */
  assignee: string | null;
  /** 标签列表。 */
  tags: string[];
  /** 创建时间。 */
  createdAt: string;
  /** 最后更新时间。 */
  updatedAt: string;
  /** 指向 SonarQube 页面的深链。 */
  sonarUrl: string;
  /** 规则描述文本；仅在 `detailLevel=full` 时尽量补充，优先取 `descriptionSections`。 */
  ruleDescription: string | null;
}

/**
 * `sonarqube_issues_search` 的结构化返回体。
 */
export interface ProjectIssuesSearchResult {
  /** 项目基础信息。 */
  project: ProjectInfo;
  /** 本次搜索使用的过滤条件。 */
  filters: IssueSearchFilters;
  /** 分页信息。 */
  paging: {
    page: number;
    pageSize: number;
    total: number;
    returned: number;
  };
  /** issue 列表。 */
  issues: IssueSearchItem[];
  /** 调试与追查问题时使用的原始 API 返回。 */
  raw: unknown;
}

/**
 * `/api/hotspots/search` 当前公开的 Hotspot 状态枚举。
 */
export const HOTSPOT_STATUS_VALUES = ["TO_REVIEW", "REVIEWED"] as const;

/**
 * `/api/hotspots/search` 当前公开的 Hotspot 状态枚举。
 */
export type HotspotStatus = (typeof HOTSPOT_STATUS_VALUES)[number];

/**
 * `/api/hotspots/search` 当前公开的 Hotspot 处理结论枚举。
 */
export const HOTSPOT_RESOLUTION_VALUES = ["FIXED", "SAFE", "ACKNOWLEDGED"] as const;

/**
 * `/api/hotspots/search` 当前公开的 Hotspot 处理结论枚举。
 */
export type HotspotResolution = (typeof HOTSPOT_RESOLUTION_VALUES)[number];

/**
 * `/api/components/tree` 当前公开的遍历策略枚举。
 */
export const COMPONENT_TREE_STRATEGY_VALUES = ["all", "children", "leaves"] as const;

/**
 * `/api/components/tree` 当前公开的遍历策略枚举。
 */
export type ComponentsTreeStrategy = (typeof COMPONENT_TREE_STRATEGY_VALUES)[number];

/**
 * `/api/components/tree` 当前公开的组件限定符枚举。
 */
export const COMPONENT_TREE_QUALIFIER_VALUES = [
  "APP",
  "VW",
  "SVW",
  "UTS",
  "FIL",
  "DIR",
  "TRK"
] as const;

/**
 * `/api/components/tree` 当前公开的组件限定符枚举。
 */
export type ComponentQualifier = (typeof COMPONENT_TREE_QUALIFIER_VALUES)[number];

/**
 * `/api/components/tree` 当前公开的排序字段枚举。
 */
export const COMPONENT_TREE_SORT_VALUES = ["name", "path", "qualifier"] as const;

/**
 * `/api/components/tree` 当前公开的排序字段枚举。
 */
export type ComponentsTreeSortField = (typeof COMPONENT_TREE_SORT_VALUES)[number];

/**
 * Security Hotspot 搜索过滤条件。
 *
 * @remarks
 * 该结构映射到 `/api/hotspots/search` 的现行公开参数。
 * 当前明确不暴露官方已标记为 deprecated 的 `sansTop25`。
 * `detailLevel` 是 MCP 侧扩展字段，不会直接透传给 SonarQube。
 */
export interface HotspotSearchFilters {
  /** Security Hotspot key 列表；映射到 `/api/hotspots/search` 的 `hotspots`。 */
  hotspots: string[];
  /** Hotspot 状态；映射到 `status`。 */
  status: HotspotStatus | null;
  /** Hotspot 处理结论；映射到 `resolution`。 */
  resolution: HotspotResolution | null;
  /** 文件路径列表；映射到 `files`。 */
  files: string[];
  /** 是否只返回分配给当前用户的 Hotspot；映射到 `onlyMine`。 */
  onlyMine: boolean | null;
  /** 是否仅返回新代码周期内创建的 Hotspot；映射到 `inNewCodePeriod`。 */
  inNewCodePeriod: boolean | null;
  /** 当前页码，从 1 开始。 */
  page: number;
  /** 当前页大小；官方默认 100。 */
  pageSize: number;
  /** MCP 侧详情级别；`full` 时会额外补充规则描述。 */
  detailLevel: DetailLevel;
}

/**
 * 通用 Security Hotspot 搜索结果中的单条摘要。
 *
 * @remarks
 * 该结构优先保留 `/api/hotspots/search` 的现行公开字段，
 * 仅在 `detailLevel=full` 时通过 `/api/rules/show` 额外补规则描述。
 */
export interface HotspotSearchItem {
  /** Hotspot key。 */
  key: string;
  /** SonarQube 规则 key。 */
  ruleKey: string;
  /** 规则展示名。 */
  ruleName: string | null;
  /** SonarSource 安全分类，例如 `auth`。 */
  securityCategory: string | null;
  /** 问题主消息。 */
  message: string;
  /** 当前状态。 */
  status: HotspotStatus | string;
  /** 当前处理结论；未设置时为空。 */
  resolution: HotspotResolution | string | null;
  /** 风险概率。 */
  vulnerabilityProbability: string | null;
  /** 相对文件路径。 */
  file: string | null;
  /** 问题所在行号。 */
  line: number | null;
  /** 更精细的文本范围。 */
  textRange: TextRange | null;
  /** 作者信息。 */
  author: string | null;
  /** 负责人信息。 */
  assignee: string | null;
  /** 创建时间。 */
  createdAt: string;
  /** 最后更新时间。 */
  updatedAt: string;
  /** 指向 SonarQube 页面的深链。 */
  sonarUrl: string;
  /** 规则描述；仅在 `detailLevel=full` 时尽量补充。 */
  ruleDescription: string | null;
}

/**
 * `sonarqube_hotspots_search` 的结构化返回体。
 */
export interface ProjectHotspotsSearchResult {
  /** 项目基础信息。 */
  project: ProjectInfo;
  /** 本次搜索使用的过滤条件。 */
  filters: HotspotSearchFilters;
  /** 分页信息。 */
  paging: {
    page: number;
    pageSize: number;
    total: number;
    returned: number;
  };
  /** Hotspot 列表。 */
  hotspots: HotspotSearchItem[];
  /** 调试与追查问题时使用的原始 API 返回。 */
  raw: unknown;
}

/**
 * 组件树查询时使用的过滤条件。
 *
 * @remarks
 * 当前字段映射 SonarQube `/api/components/tree` 中已核对的参数：
 * - `component`
 * - `strategy`
 * - `qualifiers`
 * - `q`
 * - `s`
 * - `asc`
 * - `p/ps`
 */
export interface ComponentsTreeFilters {
  /** 遍历起点组件 key；映射到 `/api/components/tree` 的 `component`。 */
  component: string;
  /** 遍历策略；映射到 `strategy`。 */
  strategy: ComponentsTreeStrategy;
  /** 组件限定符过滤；映射到 `qualifiers`。 */
  qualifiers: ComponentQualifier[];
  /** 名称或精确 key 搜索串；映射到 `q`。 */
  q: string | null;
  /** 排序字段；映射到底层 `s`。 */
  sortFields: ComponentsTreeSortField[];
  /** 是否升序；映射到 `asc`。 */
  asc: boolean;
  /** 当前页码，从 1 开始。 */
  page: number;
  /** 当前页大小；官方上限 500。 */
  pageSize: number;
}

/**
 * 组件树中的单个节点。
 *
 * @remarks
 * 这里统一覆盖 `baseComponent` 与 `components[]` 中当前服务会对外暴露的字段。
 */
export interface ComponentTreeNode {
  /** 组件 key。 */
  key: string;
  /** 组件短名。 */
  name: string;
  /** 组件长名。 */
  longName: string | null;
  /** 组件限定符，例如 `TRK`、`DIR`、`FIL`。 */
  qualifier: string | null;
  /** 相对路径；文件/目录节点常见。 */
  path: string | null;
  /** 所属项目 key。 */
  project: string | null;
  /** 组件描述；项目或应用节点常见。 */
  description: string | null;
  /** 组件标签列表。 */
  tags: string[];
  /** 组件可见性，例如 `public`。 */
  visibility: string | null;
  /** 是否启用 AI CodeFix。 */
  isAiCodeFixEnabled: boolean | null;
  /** 组件是否启用。 */
  enabled: boolean | null;
}

/**
 * `sonarqube_components_tree_get` 的结构化返回体。
 */
export interface ProjectComponentsTreeResult {
  /** 项目基础信息。 */
  project: ProjectInfo;
  /** 本次查询使用的过滤条件。 */
  filters: ComponentsTreeFilters;
  /** 分页信息。 */
  paging: {
    page: number;
    pageSize: number;
    total: number;
    returned: number;
  };
  /** 当前遍历起点。 */
  baseComponent: ComponentTreeNode;
  /** 当前页返回的组件节点列表。 */
  components: ComponentTreeNode[];
  /** 调试与追查问题时使用的原始 API 返回。 */
  raw: unknown;
}

/**
 * 对外暴露的规则详情结构。
 */
export interface RuleDetail {
  /** 规则 key。 */
  key: string;
  /** 规则名称。 */
  name: string;
  /** 语言；某些规则或实例版本下可能为空。 */
  lang: string | null;
  /** 严重度。 */
  severity: string | null;
  /** 类型，例如 `BUG`、`VULNERABILITY`、`CODE_SMELL`。 */
  type: string | null;
  /** Clean Code 属性。 */
  cleanCodeAttribute: string | null;
  /** 用户标签。 */
  tags: string[];
  /** 系统标签。 */
  sysTags: string[];
  /** 规则描述；优先拼接 `descriptionSections`，缺失时回退旧描述字段，匿名实例可能返回混淆内容。 */
  description: string | null;
}

/**
 * `sonarqube_rules_get` 的结构化返回体。
 */
export interface RulesGetResult {
  /** SonarQube 服务根地址。 */
  origin: string;
  /** 本次请求的规则 key 列表。 */
  requestedKeys: string[];
  /** 规则详情列表。 */
  rules: RuleDetail[];
  /** 调试与追查问题时使用的原始 API 返回。 */
  raw: unknown;
}

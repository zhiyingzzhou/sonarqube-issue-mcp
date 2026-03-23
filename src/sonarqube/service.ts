import type { AppConfig } from "../config.js";
import { SonarQubeMcpError } from "../errors.js";
import {
  buildHotspotBrowseUrl,
  buildIssueBrowseUrl,
  buildProjectBrowseUrl,
  parseProjectUrl
} from "../project-ref.js";
import {
  COMPONENT_TREE_QUALIFIER_VALUES,
  COMPONENT_TREE_SORT_VALUES,
  COMPONENT_TREE_STRATEGY_VALUES,
  HOTSPOT_RESOLUTION_VALUES,
  HOTSPOT_STATUS_VALUES,
  IMPACT_SEVERITY_VALUES,
  ISSUE_STATUS_VALUES,
  ISSUE_TYPE_VALUES,
  OVERVIEW_ITEM_VALUES,
  SOFTWARE_QUALITY_VALUES,
} from "../types.js";
import type {
  ComponentTreeNode,
  ComponentsTreeFilters,
  DetailLevel,
  FindingCategory,
  FindingBucket,
  FindingDetail,
  FindingSummary,
  HotspotSearchFilters,
  HotspotSearchItem,
  ImpactSeverity,
  IssueStatus,
  IssueSearchFilters,
  IssueSearchItem,
  IssueType,
  OverviewItemKey,
  ProjectMeasure,
  ProjectComponentsTreeResult,
  ProjectLocator,
  ProjectFindingsResult,
  ProjectHotspotsSearchResult,
  ProjectInfo,
  ProjectIssuesSearchResult,
  ProjectMeasuresResult,
  ProjectOverviewResult,
  ProjectQualityGateResult,
  ProjectUrlInput,
  QualityGateCondition,
  QualityGatePeriod,
  RuleDetail,
  RulesGetResult,
  SoftwareQuality
} from "../types.js";
import type {
  SonarHotspotSearchItem,
  SonarHotspotShowResponse,
  SonarIssue,
  SonarIssueRuleSummary,
  SonarProjectComponent
} from "./api-types.js";
import { SonarQubeClient } from "./client.js";

/**
 * issue 严重度排序权重，值越大越靠前。
 *
 * @remarks
 * 这里兼容旧 severity 与新版 impacts severity 的常见取值。
 */
const ISSUE_SEVERITY_RANK: Record<string, number> = {
  BLOCKER: 5,
  CRITICAL: 4,
  HIGH: 4,
  MAJOR: 3,
  MEDIUM: 3,
  MINOR: 2,
  LOW: 2,
  INFO: 1
};

/**
 * hotspot 风险概率排序权重，值越大越靠前。
 *
 * @remarks
 * 与 SonarQube `vulnerabilityProbability` 字段保持一致。
 */
const HOTSPOT_PROBABILITY_RANK: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

/**
 * 指标查询工具的默认指标集合。
 *
 * @remarks
 * 这里优先覆盖最常见的质量门禁与项目概览指标，
 * 并优先使用 SonarQube 10.8+ 引入的 `software_quality_*_issues` 现行指标。
 */
const DEFAULT_MEASURE_KEYS = [
  "alert_status",
  "accepted_issues",
  "coverage",
  "duplicated_lines_density",
  "ncloc",
  "security_hotspots",
  "software_quality_security_issues",
  "software_quality_reliability_issues",
  "software_quality_maintainability_issues"
] as const;

const DEFAULT_ISSUES_PAGE_SIZE = 50;
const DEFAULT_HOTSPOTS_PAGE_SIZE = 100;
const DEFAULT_COMPONENTS_TREE_PAGE_SIZE = 100;

/**
 * findings 分桶到 SonarQube 软件质量维度的映射。
 *
 * @remarks
 * `security-hotspot` 独立走 `/api/hotspots/*`，因此不在此映射中。
 */
const FINDING_CATEGORY_TO_SOFTWARE_QUALITY: Record<
  Exclude<FindingCategory, "security-hotspot">,
  SoftwareQuality
> = {
  security: "SECURITY",
  reliability: "RELIABILITY",
  maintainability: "MAINTAINABILITY"
};

/**
 * findings 分桶的展示标题。
 */
const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  security: "Security",
  reliability: "Reliability",
  maintainability: "Maintainability",
  "security-hotspot": "Security Hotspots"
};

/**
 * overview 项到 SonarQube metric key 的映射。
 *
 * @remarks
 * 这里统一对齐最新版公开 metric：
 * - `software_quality_*_issues`
 * - `accepted_issues`
 * - `coverage`
 * - `duplicated_lines_density`
 * - `security_hotspots`
 */
const OVERVIEW_ITEM_METRIC_KEYS: Record<OverviewItemKey, string> = {
  security: "software_quality_security_issues",
  reliability: "software_quality_reliability_issues",
  maintainability: "software_quality_maintainability_issues",
  "accepted-issues": "accepted_issues",
  coverage: "coverage",
  duplications: "duplicated_lines_density",
  "security-hotspots": "security_hotspots"
};

/**
 * overview 项的展示标题。
 */
const OVERVIEW_ITEM_LABELS: Record<OverviewItemKey, string> = {
  security: "Security",
  reliability: "Reliability",
  maintainability: "Maintainability",
  "accepted-issues": "Accepted Issues",
  coverage: "Coverage",
  duplications: "Duplications",
  "security-hotspots": "Security Hotspots"
};

/**
 * SonarQube 业务服务层。
 *
 * @remarks
 * 这一层负责把原始 SonarQube API 数据重新组装为 MCP 对外返回结构，
 * 包括查询口径、规则补全、排序规则、详情标准化和项目归属校验。
 */
export class SonarQubeFindingService {
  constructor(private readonly config: AppConfig) {}

  /**
   * 暴露默认指标集合，供 MCP schema 和文档复用。
   */
  static readonly defaultMeasureKeys = [...DEFAULT_MEASURE_KEYS];
  static readonly defaultIssuesPageSize = DEFAULT_ISSUES_PAGE_SIZE;
  static readonly defaultHotspotsPageSize = DEFAULT_HOTSPOTS_PAGE_SIZE;
  static readonly defaultComponentsTreePageSize = DEFAULT_COMPONENTS_TREE_PAGE_SIZE;

  /**
   * 获取项目级 findings 汇总。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @param detailLevel - 返回详情级别，默认 `standard`。
   * @returns 已标准化并按配置分桶后的项目问题汇总。
   *
   * @remarks
   * 这里会并行完成版本检查、项目检查，以及配置驱动的 issue/hotspot 拉取：
   * - `security / reliability / maintainability` 走 `/api/issues/search`
   * - `security-hotspot` 走 `/api/hotspots/search`
   *
   * `summary.totalFindings` 会跨桶去重，
   * 因为同一 issue 可能同时影响多个 software quality。
   *
   * @throws {SonarQubeMcpError} 当 URL 非法、项目不可访问或任一 API 请求失败时抛出。
   */
  async getProjectFindings(
    projectUrl: ProjectUrlInput,
    detailLevel: DetailLevel = "standard"
  ): Promise<ProjectFindingsResult> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);
    const requestedCategories = [...this.config.sonarDefaultFindingCategories];

    const [serverVersion, projectComponent, bucketResults] = await Promise.all([
      client.getServerVersion(),
      client.getProjectComponent(),
      Promise.all(
        requestedCategories.map(async (category) => {
          if (category === "security-hotspot") {
            return {
              category,
              kind: "hotspot" as const,
              result: await client.searchOpenHotspots()
            };
          }

          return {
            category,
            kind: "issue" as const,
            result: await client.searchOpenIssuesBySoftwareQuality(
              FINDING_CATEGORY_TO_SOFTWARE_QUALITY[category]
            )
          };
        })
      )
    ]);

    const issueBucketResults = bucketResults.filter(
      (bucket): bucket is {
        category: Exclude<FindingCategory, "security-hotspot">;
        kind: "issue";
        result: {
          issues: SonarIssue[];
          embeddedRules: Map<string, SonarIssueRuleSummary>;
        };
      } => bucket.kind === "issue"
    );
    const hotspotBucketResult = bucketResults.find(
      (bucket): bucket is {
        category: "security-hotspot";
        kind: "hotspot";
        result: SonarHotspotSearchItem[];
      } => bucket.kind === "hotspot"
    );

    // issue 与 hotspot 的规则需要单独补齐规则描述，先做去重再批量拉取。
    const allIssueRuleKeys = unique(
      issueBucketResults.flatMap((bucket) => bucket.result.issues.map((issue) => issue.rule))
    );
    const hotspotRuleKeys = unique(
      (hotspotBucketResult?.result ?? []).map((hotspot) => hotspot.ruleKey)
    );
    const hotspotDetails =
      detailLevel === "full" && hotspotBucketResult
        ? await mapWithConcurrency(
            hotspotBucketResult.result,
            8,
            async (hotspot) => client.getHotspotDetail(hotspot.key)
          )
        : [];

    const [issueRules, hotspotRules] = await Promise.all([
      this.getRulesByKey(client, allIssueRuleKeys),
      this.getRulesByKey(client, hotspotRuleKeys)
    ]);

    const project = this.buildProjectInfo(
      projectRef,
      projectComponent.name,
      projectComponent.qualifier,
      serverVersion
    );

    const hotspotByKey = new Map(hotspotDetails.map((item) => [item.key, item]));
    const buckets: FindingBucket[] = requestedCategories.map((category) => {
      if (category === "security-hotspot") {
        const items = (hotspotBucketResult?.result ?? [])
          .map((hotspot) =>
            this.normalizeHotspot(
              hotspotByKey.get(hotspot.key) ?? null,
              hotspot,
              hotspotRules.get(hotspot.ruleKey) ?? null,
              projectRef,
              detailLevel
            )
          )
          .sort(compareHotspots);

        return {
          category,
          label: FINDING_CATEGORY_LABELS[category],
          count: items.length,
          items
        };
      }

      const issueBucket = issueBucketResults.find((bucket) => bucket.category === category);
      const items = (issueBucket?.result.issues ?? [])
        .map((issue) =>
          this.normalizeIssue(
            issue,
            issueRules.get(issue.rule) ?? issueBucket?.result.embeddedRules.get(issue.rule) ?? null,
            projectRef,
            category,
            detailLevel
          )
        )
        .sort(compareIssues);

      return {
        category,
        label: FINDING_CATEGORY_LABELS[category],
        count: items.length,
        items
      };
    });

    const totalFindings = new Set(
      buckets.flatMap((bucket) => bucket.items.map((item) => `${item.kind}:${item.key}`))
    ).size;

    return {
      project,
      summary: {
        requestedCategories,
        totalFindings,
        detailLevel
      },
      buckets
    };
  }

  /**
   * 获取单条问题详情。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @param kind - 详情类型，`issue` 或 `hotspot`。
   * @param key - SonarQube 侧的问题 key。
   * @returns 单条问题的标准化详情。
   *
   * @remarks
   * 详情接口会再次校验问题是否属于当前项目，避免误传别的项目 key 时串数据。
   *
   * @throws {SonarQubeMcpError}
   * 当项目不匹配、问题类型不在支持范围内或底层请求失败时抛出。
   */
  async getFindingDetail(
    projectUrl: ProjectUrlInput,
    kind: "issue" | "hotspot",
    key: string
  ): Promise<FindingDetail> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);
    const [serverVersion, projectComponent] = await Promise.all([
      client.getServerVersion(),
      client.getProjectComponent()
    ]);
    const project = this.buildProjectInfo(
      projectRef,
      projectComponent.name,
      projectComponent.qualifier,
      serverVersion
    );

    if (kind === "issue") {
      const { issue, embeddedRule } = await client.getIssueByKey(key);
      const issueProjectKey = issue.project ?? deriveProjectKey(issue.component);
      if (issueProjectKey !== projectRef.projectKey) {
        throw new SonarQubeMcpError(
          "VALIDATION",
          `issue ${key} 不属于项目 ${projectRef.projectKey}，实际项目为 ${issueProjectKey ?? "unknown"}。`
        );
      }

      const [rule, changelog] = await Promise.all([
        this.getRuleOrFallback(client, issue.rule, embeddedRule),
        client.getIssueChangelog(key)
      ]);

      // 详情接口允许 Security / Reliability / Maintainability 三类 issue，
      // 优先根据新版 impacts 维度判断，缺失时再回退旧 type。
      const category = this.detectIssueFindingCategory(issue);
      if (!category) {
        throw new SonarQubeMcpError(
          "VALIDATION",
          `issue ${key} 不是当前 findings 支持的 Security / Reliability / Maintainability 范围内问题。`
        );
      }

      return {
        project,
        summary: this.normalizeIssue(issue, rule, projectRef, category, "full"),
        comments: issue.comments ?? [],
        changelog,
        flows: issue.flows ?? [],
        raw: {
          issue,
          rule,
          changelog
        }
      };
    }

    const hotspot = await client.getHotspotDetail(key);
    if (hotspot.project.key !== projectRef.projectKey) {
      throw new SonarQubeMcpError(
        "VALIDATION",
        `hotspot ${key} 不属于项目 ${projectRef.projectKey}，实际项目为 ${hotspot.project.key}。`
      );
    }

    const rule = await this.getRuleOrFallback(client, hotspot.rule.key, null);

    return {
      project,
      summary: this.normalizeHotspot(hotspot, null, rule, projectRef, "full"),
      comments: hotspot.comment ?? [],
      changelog: hotspot.changelog ?? [],
      flows: hotspot.flows ?? [],
      raw: {
        hotspot,
        rule
      }
    };
  }

  /**
   * 按过滤条件搜索 issue。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @param filters - 搜索过滤条件。
   * @returns 标准化后的 issue 搜索结果。
   */
  async searchIssues(
    projectUrl: ProjectUrlInput,
    filters?: Partial<IssueSearchFilters>
  ): Promise<ProjectIssuesSearchResult> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);
    const normalizedFilters = this.normalizeIssueSearchFilters(filters);

    const [serverVersion, projectComponent, searchResult] = await Promise.all([
      client.getServerVersion(),
      client.getProjectComponent(),
      client.searchIssues({
        types: normalizedFilters.types,
        impactSoftwareQualities: normalizedFilters.impactSoftwareQualities,
        issueStatuses: normalizedFilters.issueStatuses,
        impactSeverities: normalizedFilters.impactSeverities,
        resolved: normalizedFilters.resolved,
        page: normalizedFilters.page,
        pageSize: normalizedFilters.pageSize
      })
    ]);

    const ruleMap =
      normalizedFilters.detailLevel === "full"
        ? await this.getRulesByKey(
            client,
            unique(searchResult.issues.map((issue) => issue.rule))
          )
        : new Map<string, SonarIssueRuleSummary>();

    const project = this.buildProjectInfo(
      projectRef,
      projectComponent.name,
      projectComponent.qualifier,
      serverVersion
    );

    return {
      project,
      filters: normalizedFilters,
      paging: {
        page: normalizedFilters.page,
        pageSize: normalizedFilters.pageSize,
        total: searchResult.total,
        returned: searchResult.issues.length
      },
      issues: searchResult.issues.map((issue) =>
        this.normalizeSearchIssue(
          issue,
          ruleMap.get(issue.rule) ?? searchResult.embeddedRules.get(issue.rule) ?? null,
          projectRef,
          normalizedFilters.detailLevel
        )
      ),
      raw: {
        total: searchResult.total
      }
    };
  }

  /**
   * 按过滤条件搜索 Security Hotspot。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @param filters - 搜索过滤条件。
   * @returns 标准化后的 Hotspot 搜索结果。
   */
  async searchHotspots(
    projectUrl: ProjectUrlInput,
    filters?: Partial<HotspotSearchFilters>
  ): Promise<ProjectHotspotsSearchResult> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);
    const normalizedFilters = this.normalizeHotspotSearchFilters(filters);

    const [serverVersion, projectComponent, searchResult] = await Promise.all([
      client.getServerVersion(),
      client.getProjectComponent(),
      client.searchHotspots({
        ...(normalizedFilters.status ? { status: normalizedFilters.status } : {}),
        ...(normalizedFilters.resolution ? { resolution: normalizedFilters.resolution } : {}),
        ...(normalizedFilters.files.length ? { files: normalizedFilters.files } : {}),
        ...(normalizedFilters.hotspots.length ? { hotspots: normalizedFilters.hotspots } : {}),
        ...(typeof normalizedFilters.onlyMine === "boolean"
          ? { onlyMine: normalizedFilters.onlyMine }
          : {}),
        ...(typeof normalizedFilters.inNewCodePeriod === "boolean"
          ? { inNewCodePeriod: normalizedFilters.inNewCodePeriod }
          : {}),
        page: normalizedFilters.page,
        pageSize: normalizedFilters.pageSize
      })
    ]);

    const hotspotRuleKeys = unique(searchResult.hotspots.map((hotspot) => hotspot.ruleKey));
    const hotspotRules = await this.getRulesByKey(client, hotspotRuleKeys);

    const project = this.buildProjectInfo(
      projectRef,
      projectComponent.name,
      projectComponent.qualifier,
      serverVersion
    );

    return {
      project,
      filters: normalizedFilters,
      paging: {
        page: normalizedFilters.page,
        pageSize: normalizedFilters.pageSize,
        total: searchResult.total,
        returned: searchResult.hotspots.length
      },
      hotspots: searchResult.hotspots
        .map((hotspot) =>
          this.normalizeSearchHotspot(
            hotspot,
            hotspotRules.get(hotspot.ruleKey) ?? null,
            projectRef,
            normalizedFilters.detailLevel
          )
        )
        .sort(compareSearchHotspots),
      raw: {
        paging: {
          total: searchResult.total
        },
        components: searchResult.components
      }
    };
  }

  /**
   * 获取组件树的单页结果。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @param filters - 组件树过滤条件。
   * @returns 标准化后的组件树结果。
   */
  async getComponentsTree(
    projectUrl: ProjectUrlInput,
    filters?: Partial<ComponentsTreeFilters>
  ): Promise<ProjectComponentsTreeResult> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);
    const normalizedFilters = this.normalizeComponentsTreeFilters(
      projectRef.projectKey,
      filters
    );

    const [serverVersion, projectComponent, treeResult] = await Promise.all([
      client.getServerVersion(),
      client.getProjectComponent(),
      client.getComponentsTree({
        componentKey: normalizedFilters.component,
        strategy: normalizedFilters.strategy,
        qualifiers: normalizedFilters.qualifiers,
        query: normalizedFilters.q,
        sortFields: normalizedFilters.sortFields,
        asc: normalizedFilters.asc,
        page: normalizedFilters.page,
        pageSize: normalizedFilters.pageSize
      })
    ]);

    const project = this.buildProjectInfo(
      projectRef,
      projectComponent.name,
      projectComponent.qualifier,
      serverVersion
    );

    return {
      project,
      filters: normalizedFilters,
      paging: {
        page: normalizedFilters.page,
        pageSize: normalizedFilters.pageSize,
        total: treeResult.paging.total,
        returned: treeResult.components.length
      },
      baseComponent: this.normalizeComponentTreeNode(treeResult.baseComponent),
      components: treeResult.components.map((component) =>
        this.normalizeComponentTreeNode(component)
      ),
      raw: {
        paging: treeResult.paging,
        baseComponent: treeResult.baseComponent,
        components: treeResult.components
      }
    };
  }

  /**
   * 按 key 获取规则详情。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @param ruleKeys - 规则 key 列表。
   * @returns 标准化后的规则详情结果。
   */
  async getRules(
    projectUrl: ProjectUrlInput,
    ruleKeys: string[]
  ): Promise<RulesGetResult> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);
    const normalizedKeys = unique(ruleKeys.map((key) => key.trim()).filter(Boolean));

    if (!normalizedKeys.length) {
      throw new SonarQubeMcpError("VALIDATION", "keys 不能为空。");
    }

    const rules = await mapWithConcurrency(normalizedKeys, 8, async (key) => client.getRule(key));

    return {
      origin: projectRef.origin,
      requestedKeys: normalizedKeys,
      rules: rules.map((rule) => this.normalizeRule(rule)),
      raw: {
        rules
      }
    };
  }

  /**
   * 获取项目质量门禁状态。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @returns 标准化后的质量门禁结果。
   */
  async getProjectQualityGate(
    projectUrl: ProjectUrlInput
  ): Promise<ProjectQualityGateResult> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);

    const [serverVersion, projectComponent, projectStatus] = await Promise.all([
      client.getServerVersion(),
      client.getProjectComponent(),
      client.getProjectQualityGate()
    ]);

    const project = this.buildProjectInfo(
      projectRef,
      projectComponent.name,
      projectComponent.qualifier,
      serverVersion
    );

    return {
      project,
      status: projectStatus.status,
      ignoredConditions: projectStatus.ignoredConditions ?? false,
      caycStatus: projectStatus.caycStatus ?? null,
      period: this.normalizeQualityGatePeriod(projectStatus.period),
      conditions: (projectStatus.conditions ?? []).map((condition) =>
        this.normalizeQualityGateCondition(condition)
      ),
      raw: {
        projectStatus
      }
    };
  }

  /**
   * 获取项目指标。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @param metricKeys - 指标 key 列表；缺省时使用默认指标集合。
   * @returns 标准化后的指标结果。
   *
   * @remarks
   * `/api/measures/component` 返回的 `component.measures` 顺序不保证等于请求 `metricKeys`，
   * 因此这里会按请求顺序重新组装对外结果。
   */
  async getProjectMeasures(
    projectUrl: ProjectUrlInput,
    metricKeys: string[] = SonarQubeFindingService.defaultMeasureKeys
  ): Promise<ProjectMeasuresResult> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);
    const normalizedMetricKeys = unique(metricKeys.map((metricKey) => metricKey.trim()).filter(Boolean));

    if (!normalizedMetricKeys.length) {
      throw new SonarQubeMcpError("VALIDATION", "metricKeys 不能为空。");
    }

    const [serverVersion, component] = await Promise.all([
      client.getServerVersion(),
      client.getProjectMeasures(normalizedMetricKeys)
    ]);

    const project = this.buildProjectInfo(
      projectRef,
      component.name,
      component.qualifier,
      serverVersion
    );

    const measuresByMetric = new Map(
      (component.measures ?? []).map((measure) => [measure.metric, this.normalizeMeasure(measure)])
    );

    return {
      project,
      metricKeys: normalizedMetricKeys,
      measures: normalizedMetricKeys.map(
        (metricKey) =>
          measuresByMetric.get(metricKey) ?? {
            metric: metricKey,
            value: null,
            bestValue: null
          }
      ),
      raw: {
        component
      }
    };
  }

  /**
   * 获取项目 overview 七项指标中的指定子集。
   *
   * @param projectUrl - SonarQube 项目页面 URL。
   * @param items - 可选 overview 项列表；缺省时使用环境变量默认值。
   * @returns 按请求顺序展开后的 overview 结果。
   *
   * @remarks
   * 当前 overview 项全部映射到 `/api/measures/component`，
   * 不再把 issue 列表与 metric 总览混为一个接口。
   */
  async getProjectOverview(
    projectUrl: ProjectUrlInput,
    items: OverviewItemKey[] = this.config.sonarDefaultOverviewItems
  ): Promise<ProjectOverviewResult> {
    const projectRef = parseProjectUrl(projectUrl);
    const client = this.createClient(projectRef);
    const normalizedItems = this.normalizeOverviewItems(items);
    const metricKeys = unique(
      normalizedItems.map((item) => OVERVIEW_ITEM_METRIC_KEYS[item])
    );

    const [serverVersion, component] = await Promise.all([
      client.getServerVersion(),
      client.getProjectMeasures(metricKeys)
    ]);

    const project = this.buildProjectInfo(
      projectRef,
      component.name,
      component.qualifier,
      serverVersion
    );

    const measuresByMetric = new Map(
      (component.measures ?? []).map((measure) => [measure.metric, this.normalizeMeasure(measure)])
    );

    return {
      project,
      requestedItems: normalizedItems,
      items: normalizedItems.map((item) => {
        const metricKey = OVERVIEW_ITEM_METRIC_KEYS[item];
        const measure = measuresByMetric.get(metricKey);

        return {
          key: item,
          label: OVERVIEW_ITEM_LABELS[item],
          metricKey,
          value: measure?.value ?? null,
          bestValue: measure?.bestValue ?? null
        };
      }),
      raw: {
        metricKeys,
        component
      }
    };
  }

  /**
   * 基于全局配置为当前项目创建隔离的 SonarQube client。
   *
   * @param projectRef - 当前项目上下文。
   * @returns 已绑定项目上下文的 SonarQube client。
   */
  private createClient(projectRef: ProjectLocator): SonarQubeClient {
    return new SonarQubeClient(projectRef, {
      token: this.config.sonarToken,
      requestTimeoutMs: this.config.sonarRequestTimeoutMs,
      retryCount: this.config.sonarRetryCount,
      httpProxy: this.config.sonarHttpProxy
    });
  }

  /**
   * 组装对外暴露的项目基础信息。
   *
   * @param projectRef - 当前项目上下文。
   * @param projectName - SonarQube 返回的项目名。
   * @param qualifier - SonarQube 组件限定符。
   * @param serverVersion - SonarQube 服务版本。
   * @returns 对外返回的项目基础信息。
   */
  private buildProjectInfo(
    projectRef: ProjectLocator,
    projectName: string,
    qualifier: string | undefined,
    serverVersion: string
  ): ProjectInfo {
    return {
      origin: projectRef.origin,
      key: projectRef.projectKey,
      name: projectName,
      qualifier: qualifier ?? null,
      branch: projectRef.branch,
      pullRequest: projectRef.pullRequest,
      browseUrl: buildProjectBrowseUrl(projectRef),
      serverVersion
    };
  }

  /**
   * 标准化质量门禁条件。
   *
   * @param condition - SonarQube 原始条件。
   * @returns 统一后的条件对象。
   */
  private normalizeQualityGateCondition(condition: {
    status: string;
    metricKey: string;
    comparator?: string;
    errorThreshold?: string;
    actualValue?: string;
  }): QualityGateCondition {
    return {
      status: condition.status,
      metricKey: condition.metricKey,
      comparator: condition.comparator ?? null,
      errorThreshold: condition.errorThreshold ?? null,
      actualValue: condition.actualValue ?? null
    };
  }

  /**
   * 标准化质量门禁周期信息。
   *
   * @param period - SonarQube 原始周期信息。
   * @returns 统一后的周期对象。
   */
  private normalizeQualityGatePeriod(period?: {
    mode?: string;
    date?: string;
    parameter?: string;
  }): QualityGatePeriod | null {
    if (!period) {
      return null;
    }

    return {
      mode: period.mode ?? null,
      date: period.date ?? null,
      parameter: period.parameter ?? null
    };
  }

  /**
   * 标准化单条指标值。
   *
   * @param measure - SonarQube 原始指标。
   * @returns 统一后的指标值。
   */
  private normalizeMeasure(measure: {
    metric: string;
    value?: string;
    bestValue?: boolean;
  }): ProjectMeasure {
    return {
      metric: measure.metric,
      value: measure.value ?? null,
      bestValue: typeof measure.bestValue === "boolean" ? measure.bestValue : null
    };
  }

  /**
   * 规范化 issue 搜索过滤条件。
   *
   * @param filters - 原始过滤条件。
   * @returns 统一后的过滤条件。
   *
   * @remarks
   * 这里只接受现行 `issueStatuses`，不再透传已 deprecated 的 `statuses`。
   */
  private normalizeIssueSearchFilters(
    filters?: Partial<IssueSearchFilters>
  ): IssueSearchFilters {
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? SonarQubeFindingService.defaultIssuesPageSize;

    if (!Number.isInteger(page) || page <= 0) {
      throw new SonarQubeMcpError("VALIDATION", "page 必须是大于 0 的整数。");
    }

    if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 500) {
      throw new SonarQubeMcpError("VALIDATION", "pageSize 必须是 1 到 500 之间的整数。");
    }

    return {
      types: normalizeEnumList<IssueType>(
        filters?.types,
        ISSUE_TYPE_VALUES,
        "types"
      ),
      impactSoftwareQualities: normalizeEnumList<SoftwareQuality>(
        filters?.impactSoftwareQualities,
        SOFTWARE_QUALITY_VALUES,
        "impactSoftwareQualities"
      ),
      issueStatuses: normalizeEnumList<IssueStatus>(
        filters?.issueStatuses,
        ISSUE_STATUS_VALUES,
        "issueStatuses"
      ),
      impactSeverities: normalizeEnumList<ImpactSeverity>(
        filters?.impactSeverities,
        IMPACT_SEVERITY_VALUES,
        "impactSeverities"
      ),
      resolved: filters?.resolved ?? null,
      page,
      pageSize,
      detailLevel: filters?.detailLevel ?? "standard"
    };
  }

  /**
   * 规范化 overview 项列表。
   *
   * @param items - 原始 overview 项列表。
   * @returns 去重并校验后的 overview 项列表。
   */
  private normalizeOverviewItems(items: OverviewItemKey[]): OverviewItemKey[] {
    const normalizedItems = normalizeEnumList(
      items,
      OVERVIEW_ITEM_VALUES,
      "items"
    );

    if (!normalizedItems.length) {
      throw new SonarQubeMcpError("VALIDATION", "items 不能为空。");
    }

    return normalizedItems;
  }

  /**
   * 规范化 Hotspot 搜索过滤条件。
   *
   * @param filters - 原始过滤条件。
   * @returns 统一后的过滤条件。
   */
  private normalizeHotspotSearchFilters(
    filters?: Partial<HotspotSearchFilters>
  ): HotspotSearchFilters {
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? SonarQubeFindingService.defaultHotspotsPageSize;

    if (!Number.isInteger(page) || page <= 0) {
      throw new SonarQubeMcpError("VALIDATION", "page 必须是大于 0 的整数。");
    }

    if (!Number.isInteger(pageSize) || pageSize <= 0) {
      throw new SonarQubeMcpError("VALIDATION", "pageSize 必须是大于 0 的整数。");
    }

    return {
      status: normalizeOptionalEnumValue(filters?.status, HOTSPOT_STATUS_VALUES, "status"),
      resolution: normalizeOptionalEnumValue(
        filters?.resolution,
        HOTSPOT_RESOLUTION_VALUES,
        "resolution"
      ),
      files: unique((filters?.files ?? []).map((value) => value.trim()).filter(Boolean)),
      hotspots: unique((filters?.hotspots ?? []).map((value) => value.trim()).filter(Boolean)),
      onlyMine: filters?.onlyMine ?? null,
      inNewCodePeriod: filters?.inNewCodePeriod ?? null,
      page,
      pageSize,
      detailLevel: filters?.detailLevel ?? "standard"
    };
  }

  /**
   * 规范化组件树过滤条件。
   *
   * @param projectKey - 当前项目 key，用于约束组件树起点范围。
   * @param filters - 原始过滤条件。
   * @returns 统一后的过滤条件。
   */
  private normalizeComponentsTreeFilters(
    projectKey: string,
    filters?: Partial<ComponentsTreeFilters>
  ): ComponentsTreeFilters {
    const component = (filters?.component ?? projectKey).trim();
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? SonarQubeFindingService.defaultComponentsTreePageSize;
    const q = filters?.q?.trim() || null;

    if (!component) {
      throw new SonarQubeMcpError("VALIDATION", "component 不能为空。");
    }

    if (component !== projectKey && !component.startsWith(`${projectKey}:`)) {
      throw new SonarQubeMcpError(
        "VALIDATION",
        `component 必须属于当前项目 ${projectKey}。`
      );
    }

    if (!Number.isInteger(page) || page <= 0) {
      throw new SonarQubeMcpError("VALIDATION", "page 必须是大于 0 的整数。");
    }

    if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 500) {
      throw new SonarQubeMcpError("VALIDATION", "pageSize 必须是 1 到 500 之间的整数。");
    }

    if (q && q.length < 3) {
      throw new SonarQubeMcpError("VALIDATION", "q 至少需要 3 个字符。");
    }

    return {
      component,
      strategy: normalizeRequiredEnumValue(
        filters?.strategy ?? "all",
        COMPONENT_TREE_STRATEGY_VALUES,
        "strategy"
      ),
      qualifiers: normalizeEnumList(
        filters?.qualifiers,
        COMPONENT_TREE_QUALIFIER_VALUES,
        "qualifiers"
      ),
      q,
      sortFields: normalizeEnumList(
        filters?.sortFields ?? ["name"],
        COMPONENT_TREE_SORT_VALUES,
        "sortFields"
      ),
      asc: filters?.asc ?? true,
      page,
      pageSize
    };
  }

  /**
   * 批量获取并缓存规则详情。
   *
   * @param client - SonarQube client。
   * @param keys - 待查询的规则 key 列表。
   * @returns 规则 key 到规则详情的映射。
   */
  private async getRulesByKey(
    client: SonarQubeClient,
    keys: string[]
  ): Promise<Map<string, SonarIssueRuleSummary>> {
    const rules = await mapWithConcurrency(keys, 8, async (key) => client.getRule(key));
    return new Map(rules.map((rule) => [rule.key, rule]));
  }

  /**
   * 规则详情补充失败时，尽量回落到列表接口内嵌的规则摘要。
   *
   * @param client - SonarQube client。
   * @param ruleKey - 规则 key。
   * @param embeddedRule - 列表接口中已拿到的规则摘要。
   * @returns 完整规则详情或回退摘要。
   */
  private async getRuleOrFallback(
    client: SonarQubeClient,
    ruleKey: string,
    embeddedRule: SonarIssueRuleSummary | null
  ): Promise<SonarIssueRuleSummary | null> {
    try {
      return await client.getRule(ruleKey);
    } catch {
      return embeddedRule;
    }
  }

  /**
   * 将 SonarQube issue 标准化为统一 `FindingSummary`。
   *
   * @param issue - 原始 issue。
   * @param rule - 已补全的规则信息。
   * @param projectRef - 当前项目上下文。
   * @param category - 目标分类。
   * @param detailLevel - 返回详情级别。
   * @returns 统一结构的问题摘要。
   */
  private normalizeIssue(
    issue: SonarIssue,
    rule: SonarIssueRuleSummary | null,
    projectRef: ProjectLocator,
    category: Exclude<FindingCategory, "security-hotspot">,
    detailLevel: DetailLevel
  ): FindingSummary {
    return {
      key: issue.key,
      kind: "issue",
      category,
      ruleKey: issue.rule,
      ruleName: rule?.name ?? null,
      message: issue.message,
      status: issue.issueStatus ?? issue.status,
      resolution: issue.resolution ?? null,
      severity: this.pickIssueSeverity(issue),
      vulnerabilityProbability: null,
      impacts: issue.impacts ?? [],
      cleanCodeAttribute: issue.cleanCodeAttribute ?? rule?.cleanCodeAttribute ?? null,
      file: extractFilePath(issue.component, projectRef.projectKey),
      line: issue.line ?? null,
      textRange: issue.textRange ?? null,
      author: issue.author ?? null,
      assignee: issue.assignee ?? null,
      tags: issue.tags ?? [],
      createdAt: issue.creationDate,
      updatedAt: issue.updateDate,
      sonarUrl: buildIssueBrowseUrl(projectRef, issue.key),
      ruleDescription: detailLevel === "full" ? pickRuleDescription(rule) : null,
      riskDescription: null,
      fixRecommendations: null,
      vulnerabilityDescription: null
    };
  }

  /**
   * 将 SonarQube issue 标准化为通用 issue 搜索结果。
   *
   * @param issue - 原始 issue。
   * @param rule - 已补全的规则信息。
   * @param projectRef - 当前项目上下文。
   * @param detailLevel - 返回详情级别。
   * @returns 通用 issue 摘要。
   */
  private normalizeSearchIssue(
    issue: SonarIssue,
    rule: SonarIssueRuleSummary | null,
    projectRef: ProjectLocator,
    detailLevel: DetailLevel
  ): IssueSearchItem {
    return {
      key: issue.key,
      type: issue.type ?? null,
      ruleKey: issue.rule,
      ruleName: rule?.name ?? null,
      message: issue.message,
      status: issue.issueStatus ?? issue.status,
      issueStatus: issue.issueStatus ?? null,
      resolution: issue.resolution ?? null,
      severity: this.pickIssueSeverity(issue),
      impacts: issue.impacts ?? [],
      cleanCodeAttribute: issue.cleanCodeAttribute ?? rule?.cleanCodeAttribute ?? null,
      file: extractFilePath(issue.component, projectRef.projectKey),
      line: issue.line ?? null,
      textRange: issue.textRange ?? null,
      author: issue.author ?? null,
      assignee: issue.assignee ?? null,
      tags: issue.tags ?? [],
      createdAt: issue.creationDate,
      updatedAt: issue.updateDate,
      sonarUrl: buildIssueBrowseUrl(projectRef, issue.key),
      ruleDescription: detailLevel === "full" ? pickRuleDescription(rule) : null
    };
  }

  /**
   * 将 `/api/hotspots/search` 的单条记录标准化为 MCP 对外结构。
   *
   * @param hotspot - 原始 Hotspot 搜索结果。
   * @param rule - 已补全的规则信息。
   * @param projectRef - 当前项目上下文。
   * @param detailLevel - 返回详情级别。
   * @returns 标准化后的 Hotspot 搜索摘要。
   */
  private normalizeSearchHotspot(
    hotspot: SonarHotspotSearchItem,
    rule: SonarIssueRuleSummary | null,
    projectRef: ProjectLocator,
    detailLevel: DetailLevel
  ): HotspotSearchItem {
    return {
      key: hotspot.key,
      ruleKey: hotspot.ruleKey,
      ruleName: rule?.name ?? null,
      securityCategory: hotspot.securityCategory ?? null,
      message: hotspot.message,
      status: hotspot.status,
      resolution: hotspot.resolution ?? null,
      vulnerabilityProbability: hotspot.vulnerabilityProbability ?? null,
      file: extractFilePath(hotspot.component, projectRef.projectKey),
      line: hotspot.line ?? null,
      textRange: hotspot.textRange ?? null,
      author: hotspot.author ?? null,
      assignee: hotspot.assignee ?? null,
      createdAt: hotspot.creationDate,
      updatedAt: hotspot.updateDate,
      sonarUrl: buildHotspotBrowseUrl(projectRef, hotspot.key),
      ruleDescription: detailLevel === "full" ? pickRuleDescription(rule) : null
    };
  }

  /**
   * 将 hotspot 列表/详情合并后标准化为统一 `FindingSummary`。
   *
   * @param hotspotDetail - hotspot 详情；如果调用方尚未获取详情则可为 `null`。
   * @param hotspotSearch - hotspot 列表摘要；如果调用方只持有详情则可为 `null`。
   * @param rule - 已补全的规则信息。
   * @param projectRef - 当前项目上下文。
   * @param detailLevel - 返回详情级别。
   * @returns 统一结构的热点摘要。
   * @throws {SonarQubeMcpError} 当关键字段缺失时抛出。
   */
  private normalizeHotspot(
    hotspotDetail: SonarHotspotShowResponse | null,
    hotspotSearch: SonarHotspotSearchItem | null,
    rule: SonarIssueRuleSummary | null,
    projectRef: ProjectLocator,
    detailLevel: DetailLevel
  ): FindingSummary {
    const key = hotspotDetail?.key ?? hotspotSearch?.key;
    const ruleKey = hotspotDetail?.rule.key ?? hotspotSearch?.ruleKey;
    const message = hotspotDetail?.message ?? hotspotSearch?.message;
    const status = hotspotDetail?.status ?? hotspotSearch?.status;
    const resolution = hotspotDetail?.resolution ?? hotspotSearch?.resolution ?? null;
    const updatedAt = hotspotDetail?.updateDate ?? hotspotSearch?.updateDate;
    const createdAt = hotspotDetail?.creationDate ?? hotspotSearch?.creationDate;

    if (!key || !ruleKey || !message || !status || !updatedAt || !createdAt) {
      throw new SonarQubeMcpError(
        "REMOTE",
        "Security Hotspot 数据不完整，无法标准化返回。"
      );
    }

    return {
      key,
      kind: "hotspot",
      category: "security-hotspot",
      ruleKey,
      ruleName: hotspotDetail?.rule.name ?? rule?.name ?? null,
      message,
      status,
      resolution,
      severity: null,
      vulnerabilityProbability: hotspotSearch?.vulnerabilityProbability ?? null,
      impacts: [],
      cleanCodeAttribute: rule?.cleanCodeAttribute ?? null,
      file:
        hotspotDetail?.component.path ??
        hotspotDetail?.component.longName ??
        extractFilePath(hotspotSearch?.component ?? null, projectRef.projectKey),
      line: hotspotDetail?.line ?? hotspotSearch?.line ?? null,
      textRange: hotspotDetail?.textRange ?? hotspotSearch?.textRange ?? null,
      author: hotspotDetail?.author ?? hotspotSearch?.author ?? null,
      assignee: hotspotDetail?.assignee ?? hotspotSearch?.assignee ?? null,
      tags: rule?.tags ?? rule?.sysTags ?? [],
      createdAt,
      updatedAt,
      sonarUrl: buildHotspotBrowseUrl(projectRef, key),
      ruleDescription: detailLevel === "full" ? pickRuleDescription(rule) : null,
      riskDescription: detailLevel === "full" ? hotspotDetail?.rule.riskDescription ?? null : null,
      fixRecommendations:
        detailLevel === "full" ? hotspotDetail?.rule.fixRecommendations ?? null : null,
      vulnerabilityDescription:
        detailLevel === "full" ? hotspotDetail?.rule.vulnerabilityDescription ?? null : null
    };
  }

  /**
   * 将 SonarQube 组件节点标准化为 MCP 对外结构。
   *
   * @param component - SonarQube 原始组件节点。
   * @returns 标准化后的组件树节点。
   */
  private normalizeComponentTreeNode(
    component: SonarProjectComponent
  ): ComponentTreeNode {
    return {
      key: component.key,
      name: component.name,
      longName: component.longName ?? null,
      qualifier: component.qualifier ?? null,
      path: component.path ?? null,
      project: component.project ?? null,
      description: component.description ?? null,
      tags: component.tags ?? [],
      visibility: component.visibility ?? null,
      isAiCodeFixEnabled:
        typeof component.isAiCodeFixEnabled === "boolean"
          ? component.isAiCodeFixEnabled
          : null,
      enabled: typeof component.enabled === "boolean" ? component.enabled : null
    };
  }

  /**
   * 将 SonarQube 规则详情标准化为 MCP 对外结构。
   *
   * @param rule - 原始规则详情。
   * @returns 标准化后的规则详情。
   */
  private normalizeRule(rule: SonarIssueRuleSummary): RuleDetail {
    return {
      key: rule.key,
      name: rule.name,
      lang: rule.lang ?? null,
      severity: rule.severity ?? null,
      type: rule.type ?? null,
      cleanCodeAttribute: rule.cleanCodeAttribute ?? null,
      tags: rule.tags ?? [],
      sysTags: rule.sysTags ?? [],
      description: pickRuleDescription(rule)
    };
  }

  /**
   * issue 优先使用 impacts 推导的业务严重度，没有时再回退到旧 severity。
   *
   * @param issue - 原始 issue。
   * @returns 统一后的严重度字符串。
   */
  private pickIssueSeverity(issue: SonarIssue): string | null {
    if (issue.impacts?.length) {
      const [topImpact] = [...issue.impacts].sort(
        (left, right) => severityRank(right.severity) - severityRank(left.severity)
      );
      if (topImpact) {
        return topImpact.severity;
      }
    }

    return issue.severity ?? null;
  }

  /**
   * 为单条 issue 选择最适合对外暴露的 findings 分类。
   *
   * @param issue - SonarQube 原始 issue。
   * @returns 归一化后的分类；若无法判断则返回 `null`。
   *
   * @remarks
   * 这里优先信任新版 `impacts.softwareQuality`，
   * 因为同一个 issue 可能不再能仅凭旧 `type` 准确表达软件质量维度。
   */
  private detectIssueFindingCategory(
    issue: SonarIssue
  ): Exclude<FindingCategory, "security-hotspot"> | null {
    const impactQualities = new Set(
      (issue.impacts ?? [])
        .map((impact) => impact.softwareQuality?.trim().toUpperCase())
        .filter(Boolean)
    );

    for (const softwareQuality of SOFTWARE_QUALITY_VALUES) {
      if (impactQualities.has(softwareQuality)) {
        return mapSoftwareQualityToFindingCategory(softwareQuality);
      }
    }

    if (issue.type === "VULNERABILITY") {
      return "security";
    }

    if (issue.type === "BUG") {
      return "reliability";
    }

    if (issue.type === "CODE_SMELL") {
      return "maintainability";
    }

    return null;
  }
}

/**
 * 将 SonarQube 软件质量维度映射为 MCP findings 分类。
 *
 * @param softwareQuality - SonarQube 软件质量维度。
 * @returns 对应的 findings 分类。
 */
function mapSoftwareQualityToFindingCategory(
  softwareQuality: SoftwareQuality
): Exclude<FindingCategory, "security-hotspot"> {
  const categoryMap: Record<
    SoftwareQuality,
    Exclude<FindingCategory, "security-hotspot">
  > = {
    SECURITY: "security",
    RELIABILITY: "reliability",
    MAINTAINABILITY: "maintainability"
  };

  return categoryMap[softwareQuality];
}

/**
 * issue 列表排序：严重度优先，其次更新时间，再次 key。
 *
 * @param left - 左侧问题。
 * @param right - 右侧问题。
 * @returns 标准 `Array.prototype.sort` 比较结果。
 */
function compareIssues(left: FindingSummary, right: FindingSummary): number {
  return (
    severityRank(right.severity) - severityRank(left.severity) ||
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
    left.key.localeCompare(right.key)
  );
}

/**
 * hotspot 列表排序：风险概率优先，其次更新时间，再次 key。
 *
 * @param left - 左侧热点。
 * @param right - 右侧热点。
 * @returns 标准 `Array.prototype.sort` 比较结果。
 */
function compareHotspots(left: FindingSummary, right: FindingSummary): number {
  return (
    hotspotRank(right.vulnerabilityProbability) - hotspotRank(left.vulnerabilityProbability) ||
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
    left.key.localeCompare(right.key)
  );
}

/**
 * Hotspot 搜索结果排序：风险概率优先，其次更新时间，再次 key。
 *
 * @param left - 左侧热点。
 * @param right - 右侧热点。
 * @returns 标准 `Array.prototype.sort` 比较结果。
 */
function compareSearchHotspots(left: HotspotSearchItem, right: HotspotSearchItem): number {
  return (
    hotspotRank(right.vulnerabilityProbability) - hotspotRank(left.vulnerabilityProbability) ||
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
    left.key.localeCompare(right.key)
  );
}

/**
 * 将严重度映射为可排序的数值。
 *
 * @param severity - 严重度字符串。
 * @returns 排序权重。
 */
function severityRank(severity: string | null): number {
  if (!severity) {
    return 0;
  }

  return ISSUE_SEVERITY_RANK[severity] ?? 0;
}

/**
 * 将 hotspot 概率映射为可排序的数值。
 *
 * @param probability - 风险概率字符串。
 * @returns 排序权重。
 */
function hotspotRank(probability: string | null): number {
  if (!probability) {
    return 0;
  }

  return HOTSPOT_PROBABILITY_RANK[probability] ?? 0;
}

/**
 * 优先选择最新的结构化规则描述，缺失时再回退到旧描述字段。
 *
 * @remarks
 * 2026.2 起匿名访问某些 SonarQube 实例时，描述相关字段可能被官方混淆，
 * 因此这里不对内容做语义假设，只负责按优先级择优返回。
 *
 * @param rule - 规则详情。
 * @returns 最适合展示的规则描述文本。
 */
function pickRuleDescription(rule: SonarIssueRuleSummary | null): string | null {
  if (!rule) {
    return null;
  }

  const sectionDescription = rule.descriptionSections
    ?.map((section) => section.content.trim())
    .filter(Boolean)
    .join("\n\n");

  if (sectionDescription) {
    return sectionDescription;
  }

  return rule.mdDesc ?? rule.htmlDesc ?? null;
}

/**
 * 从 `projectKey:path/to/file` 形式的 component key 中抽出相对文件路径。
 *
 * @param component - SonarQube component key。
 * @param projectKey - 当前项目 key。
 * @returns 相对文件路径；如果无法解析则回退原值或 `null`。
 */
function extractFilePath(component: string | null, projectKey: string): string | null {
  if (!component) {
    return null;
  }

  const prefix = `${projectKey}:`;
  if (component.startsWith(prefix)) {
    return component.slice(prefix.length);
  }

  return component;
}

/**
 * 从 component key 中推导项目 key，用于详情场景的归属校验。
 *
 * @param component - SonarQube component key。
 * @returns 推导出的项目 key；如果为空则返回 `null`。
 */
function deriveProjectKey(component: string | null): string | null {
  if (!component) {
    return null;
  }

  const separatorIndex = component.indexOf(":");
  if (separatorIndex === -1) {
    return component;
  }

  return component.slice(0, separatorIndex);
}

/**
 * 对字符串数组做去重，保留原始顺序。
 *
 * @param values - 原始字符串数组。
 * @returns 去重后的数组。
 */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * 规范化必填枚举值，并在值超出官方文档已知范围时抛出校验错误。
 *
 * @param value - 原始输入值。
 * @param allowedValues - 允许的枚举集合。
 * @param fieldName - 字段名，用于错误提示。
 * @returns 规范化后的枚举值。
 */
function normalizeRequiredEnumValue<TValue extends string>(
  value: string,
  allowedValues: readonly TValue[],
  fieldName: string
): TValue {
  const normalized = value.trim();
  if (!normalized) {
    throw new SonarQubeMcpError("VALIDATION", `${fieldName} 不能为空。`);
  }

  if (!allowedValues.includes(normalized as TValue)) {
    throw new SonarQubeMcpError(
      "VALIDATION",
      `${fieldName} 只能是以下值之一: ${allowedValues.join(", ")}。`
    );
  }

  return normalized as TValue;
}

/**
 * 规范化可选枚举值；为空时返回 `null`，否则按官方枚举做校验。
 *
 * @param value - 原始输入值。
 * @param allowedValues - 允许的枚举集合。
 * @param fieldName - 字段名，用于错误提示。
 * @returns 规范化后的枚举值或 `null`。
 */
function normalizeOptionalEnumValue<TValue extends string>(
  value: string | null | undefined,
  allowedValues: readonly TValue[],
  fieldName: string
): TValue | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalizeRequiredEnumValue(normalized, allowedValues, fieldName);
}

/**
 * 规范化枚举数组，保留原始顺序并校验每一项都在官方枚举范围内。
 *
 * @param values - 原始输入数组。
 * @param allowedValues - 允许的枚举集合。
 * @param fieldName - 字段名，用于错误提示。
 * @returns 去重并校验后的枚举数组。
 */
function normalizeEnumList<TValue extends string>(
  values: string[] | undefined,
  allowedValues: readonly TValue[],
  fieldName: string
): TValue[] {
  const normalized = unique((values ?? []).map((value) => value.trim()).filter(Boolean));

  return normalized.map((value) =>
    normalizeRequiredEnumValue(value, allowedValues, fieldName)
  );
}

/**
 * 受控并发 map。
 *
 * @param items - 待处理数组。
 * @param concurrency - 最大并发数。
 * @param mapper - 单项异步转换函数。
 * @returns 与输入顺序一致的结果数组。
 *
 * @remarks
 * 这里用于批量拉取 rule / hotspot 详情，避免一次性放大到过多并发请求。
 */
async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      // 通过共享索引把任务分配给多个 worker；这里不需要额外锁，
      // 因为 JavaScript 事件循环下同一时刻只会有一个同步段修改 nextIndex。
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        continue;
      }

      results[currentIndex] = await mapper(item, currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

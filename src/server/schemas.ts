import * as z from "zod/v4";
import {
  DETAIL_LEVEL_VALUES,
  FINDING_CATEGORY_VALUES,
  HOTSPOT_RESOLUTION_VALUES,
  HOTSPOT_STATUS_VALUES,
  IMPACT_SEVERITY_VALUES,
  ISSUE_STATUS_VALUES,
  ISSUE_TYPE_VALUES,
  OVERVIEW_ITEM_VALUES,
  SOFTWARE_QUALITY_VALUES
} from "../types.js";

/**
 * 与 `TextRange` 对应的输出 schema。
 *
 * @remarks
 * 结构化输出 schema 负责约束 MCP tool 的 `structuredContent` 形状。
 */
const textRangeSchema = z.object({
  startLine: z.number().int(),
  endLine: z.number().int(),
  startOffset: z.number().int(),
  endOffset: z.number().int()
});

/**
 * 与 `FindingImpact` 对应的输出 schema。
 *
 * @remarks
 * 保持与 `types.ts` 中的结构一致，避免文本输出和结构化输出脱节。
 */
const findingImpactSchema = z.object({
  softwareQuality: z.string(),
  severity: z.string()
});

/**
 * 与 `ProjectInfo` 对应的输出 schema。
 *
 * @remarks
 * 所有工具的项目级返回都通过它统一约束。
 */
const projectInfoSchema = z.object({
  origin: z.string().url(),
  key: z.string(),
  name: z.string(),
  qualifier: z.string().nullable(),
  branch: z.string().nullable(),
  pullRequest: z.string().nullable(),
  browseUrl: z.string().url(),
  serverVersion: z.string()
});

/**
 * MCP 输入侧的项目 URL schema。
 *
 * @remarks
 * 这里先校验为合法 URL，具体的 SonarQube 项目 URL 解析规则由 `project-ref.ts` 负责。
 */
export const projectUrlInputSchema = z.string().url();

/**
 * 与 `FindingSummary` 对应的输出 schema。
 *
 * @remarks
 * `issue` 与 `hotspot` 在结构化输出侧共用这一套 schema。
 */
const findingSummarySchema = z.object({
  key: z.string(),
  kind: z.enum(["issue", "hotspot"]),
  category: z.enum(FINDING_CATEGORY_VALUES),
  ruleKey: z.string(),
  ruleName: z.string().nullable(),
  message: z.string(),
  status: z.string(),
  resolution: z.string().nullable(),
  severity: z.string().nullable(),
  vulnerabilityProbability: z.string().nullable(),
  impacts: z.array(findingImpactSchema),
  cleanCodeAttribute: z.string().nullable(),
  file: z.string().nullable(),
  line: z.number().int().nullable(),
  textRange: textRangeSchema.nullable(),
  author: z.string().nullable(),
  assignee: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  sonarUrl: z.string().url(),
  ruleDescription: z.string().nullable(),
  riskDescription: z.string().nullable(),
  fixRecommendations: z.string().nullable(),
  vulnerabilityDescription: z.string().nullable()
});

const qualityGateConditionSchema = z.object({
  status: z.string(),
  metricKey: z.string(),
  comparator: z.string().nullable(),
  errorThreshold: z.string().nullable(),
  actualValue: z.string().nullable()
});

const qualityGatePeriodSchema = z.object({
  mode: z.string().nullable(),
  date: z.string().nullable(),
  parameter: z.string().nullable()
});

const projectMeasureSchema = z.object({
  metric: z.string(),
  value: z.string().nullable(),
  bestValue: z.boolean().nullable()
});

const issueSearchItemSchema = z.object({
  key: z.string(),
  type: z.string().nullable(),
  ruleKey: z.string(),
  ruleName: z.string().nullable(),
  message: z.string(),
  status: z.string(),
  issueStatus: z.string().nullable(),
  resolution: z.string().nullable(),
  severity: z.string().nullable(),
  impacts: z.array(findingImpactSchema),
  cleanCodeAttribute: z.string().nullable(),
  file: z.string().nullable(),
  line: z.number().int().nullable(),
  textRange: textRangeSchema.nullable(),
  author: z.string().nullable(),
  assignee: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  sonarUrl: z.string().url(),
  ruleDescription: z.string().nullable()
});

const hotspotSearchItemSchema = z.object({
  key: z.string(),
  ruleKey: z.string(),
  ruleName: z.string().nullable(),
  securityCategory: z.string().nullable(),
  message: z.string(),
  status: z.string(),
  resolution: z.string().nullable(),
  vulnerabilityProbability: z.string().nullable(),
  file: z.string().nullable(),
  line: z.number().int().nullable(),
  textRange: textRangeSchema.nullable(),
  author: z.string().nullable(),
  assignee: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sonarUrl: z.string().url(),
  ruleDescription: z.string().nullable()
});

const componentTreeNodeSchema = z.object({
  key: z.string(),
  name: z.string(),
  longName: z.string().nullable(),
  qualifier: z.string().nullable(),
  path: z.string().nullable(),
  project: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  visibility: z.string().nullable(),
  isAiCodeFixEnabled: z.boolean().nullable(),
  enabled: z.boolean().nullable()
});

const ruleDetailSchema = z.object({
  key: z.string(),
  name: z.string(),
  lang: z.string().nullable(),
  severity: z.string().nullable(),
  type: z.string().nullable(),
  cleanCodeAttribute: z.string().nullable(),
  tags: z.array(z.string()),
  sysTags: z.array(z.string()),
  description: z.string().nullable()
});

/**
 * `sonarqube_findings_list` 的结构化输出 schema。
 *
 * @remarks
 * 与 `ProjectFindingsResult` 一一对应。
 */
export const projectFindingsResultSchema = z.object({
  project: projectInfoSchema,
  summary: z.object({
    requestedCategories: z.array(z.enum(FINDING_CATEGORY_VALUES)),
    totalFindings: z.number().int(),
    detailLevel: z.enum(DETAIL_LEVEL_VALUES)
  }),
  buckets: z.array(
    z.object({
      category: z.enum(FINDING_CATEGORY_VALUES),
      label: z.string(),
      count: z.number().int(),
      items: z.array(findingSummarySchema)
    })
  )
});

/**
 * `sonarqube_finding_get` 的结构化输出 schema。
 *
 * @remarks
 * 与 `FindingDetail` 一一对应。
 */
export const findingDetailResultSchema = z.object({
  project: projectInfoSchema,
  summary: findingSummarySchema,
  comments: z.array(z.unknown()),
  changelog: z.array(z.unknown()),
  flows: z.array(z.unknown()),
  raw: z.unknown()
});

/**
 * `sonarqube_quality_gate_get` 的结构化输出 schema。
 */
export const projectQualityGateResultSchema = z.object({
  project: projectInfoSchema,
  status: z.string(),
  ignoredConditions: z.boolean(),
  caycStatus: z.string().nullable(),
  period: qualityGatePeriodSchema.nullable(),
  conditions: z.array(qualityGateConditionSchema),
  raw: z.unknown()
});

/**
 * `sonarqube_measures_get` 的结构化输出 schema。
 */
export const projectMeasuresResultSchema = z.object({
  project: projectInfoSchema,
  metricKeys: z.array(z.string()),
  measures: z.array(projectMeasureSchema),
  raw: z.unknown()
});

/**
 * `sonarqube_overview_get` 的结构化输出 schema。
 */
export const projectOverviewResultSchema = z.object({
  project: projectInfoSchema,
  requestedItems: z.array(z.enum(OVERVIEW_ITEM_VALUES)),
  items: z.array(
    z.object({
      key: z.enum(OVERVIEW_ITEM_VALUES),
      label: z.string(),
      metricKey: z.string(),
      value: z.string().nullable(),
      bestValue: z.boolean().nullable()
    })
  ),
  raw: z.unknown()
});

/**
 * `sonarqube_issues_search` 的结构化输出 schema。
 */
export const projectIssuesSearchResultSchema = z.object({
  project: projectInfoSchema,
  filters: z.object({
    types: z.array(z.enum(ISSUE_TYPE_VALUES)),
    impactSoftwareQualities: z.array(z.enum(SOFTWARE_QUALITY_VALUES)),
    issueStatuses: z.array(z.enum(ISSUE_STATUS_VALUES)),
    impactSeverities: z.array(z.enum(IMPACT_SEVERITY_VALUES)),
    resolved: z.boolean().nullable(),
    page: z.number().int(),
    pageSize: z.number().int(),
    detailLevel: z.enum(DETAIL_LEVEL_VALUES)
  }),
  paging: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    returned: z.number().int()
  }),
  issues: z.array(issueSearchItemSchema),
  raw: z.unknown()
});

/**
 * `sonarqube_hotspots_search` 的结构化输出 schema。
 */
export const projectHotspotsSearchResultSchema = z.object({
  project: projectInfoSchema,
  filters: z.object({
    hotspots: z.array(z.string()),
    status: z.enum(HOTSPOT_STATUS_VALUES).nullable(),
    resolution: z.enum(HOTSPOT_RESOLUTION_VALUES).nullable(),
    files: z.array(z.string()),
    onlyMine: z.boolean().nullable(),
    inNewCodePeriod: z.boolean().nullable(),
    page: z.number().int(),
    pageSize: z.number().int(),
    detailLevel: z.enum(DETAIL_LEVEL_VALUES)
  }),
  paging: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    returned: z.number().int()
  }),
  hotspots: z.array(hotspotSearchItemSchema),
  raw: z.unknown()
});

/**
 * `sonarqube_components_tree_get` 的结构化输出 schema。
 */
export const projectComponentsTreeResultSchema = z.object({
  project: projectInfoSchema,
  filters: z.object({
    component: z.string(),
    strategy: z.enum(["all", "children", "leaves"]),
    qualifiers: z.array(z.enum(["APP", "VW", "SVW", "UTS", "FIL", "DIR", "TRK"])),
    q: z.string().nullable(),
    sortFields: z.array(z.enum(["name", "path", "qualifier"])),
    asc: z.boolean(),
    page: z.number().int(),
    pageSize: z.number().int()
  }),
  paging: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    returned: z.number().int()
  }),
  baseComponent: componentTreeNodeSchema,
  components: z.array(componentTreeNodeSchema),
  raw: z.unknown()
});

/**
 * `sonarqube_rules_get` 的结构化输出 schema。
 */
export const rulesGetResultSchema = z.object({
  origin: z.string().url(),
  requestedKeys: z.array(z.string()),
  rules: z.array(ruleDetailSchema),
  raw: z.unknown()
});

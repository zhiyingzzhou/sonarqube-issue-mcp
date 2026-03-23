import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { formatErrorForText, normalizeError } from "../errors.js";
import { SonarQubeFindingService } from "../sonarqube/service.js";
import {
  formatProjectComponentsTreeText,
  formatFindingDetailText,
  formatProjectHotspotsSearchText,
  formatProjectMeasuresText,
  formatProjectFindingsText,
  formatProjectIssuesSearchText,
  formatProjectOverviewText,
  formatProjectQualityGateText,
  formatRulesGetText
} from "./formatters.js";
import {
  findingDetailResultSchema,
  projectComponentsTreeResultSchema,
  projectHotspotsSearchResultSchema,
  projectIssuesSearchResultSchema,
  projectMeasuresResultSchema,
  projectFindingsResultSchema,
  projectOverviewResultSchema,
  projectQualityGateResultSchema,
  projectUrlInputSchema,
  rulesGetResultSchema
} from "./schemas.js";
import {
  DETAIL_LEVEL_VALUES,
  HOTSPOT_RESOLUTION_VALUES,
  HOTSPOT_STATUS_VALUES,
  IMPACT_SEVERITY_VALUES,
  ISSUE_STATUS_VALUES,
  ISSUE_TYPE_VALUES,
  OVERVIEW_ITEM_VALUES,
  SOFTWARE_QUALITY_VALUES
} from "../types.js";

/**
 * 把 SonarQube 相关 tool 全部注册到 MCP server。
 *
 * @param server - 当前 MCP server。
 * @param service - 业务服务层实例。
 */
export function registerSonarQubeTools(
  server: McpServer,
  service: SonarQubeFindingService
): void {
  server.registerTool(
    "sonarqube_findings_list",
    {
      title: "List SonarQube Findings",
      description:
        "根据 SonarQube 项目 URL，返回按配置分桶后的当前待处理 findings 列表；默认使用环境变量 SONAR_DEFAULT_FINDING_CATEGORIES。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL"),
        detailLevel: z
          .enum(DETAIL_LEVEL_VALUES)
          .optional()
          .describe("standard 返回标准字段，full 额外带规则说明")
      },
      outputSchema: projectFindingsResultSchema
    },
    async ({ projectUrl, detailLevel }) => {
      try {
        const result = await service.getProjectFindings(projectUrl, detailLevel ?? "standard");
        return {
          content: [
            {
              type: "text",
              text: formatProjectFindingsText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  /**
   * 单条详情工具：适合上层先取列表，再按 key 追查单项。
   *
   * @remarks
   * 这里复用同一个 service，保持列表与详情口径一致。
   */
  server.registerTool(
    "sonarqube_finding_get",
    {
      title: "Get SonarQube Finding",
      description:
        "根据 SonarQube 项目 URL 和问题 key，返回单条 issue 或 security hotspot 的完整详情。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL"),
        kind: z.enum(["issue", "hotspot"]),
        key: z.string().min(1).describe("issue key 或 hotspot key")
      },
      outputSchema: findingDetailResultSchema
    },
    async ({ projectUrl, kind, key }) => {
      try {
        const result = await service.getFindingDetail(projectUrl, kind, key);
        return {
          content: [
            {
              type: "text",
              text: formatFindingDetailText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "sonarqube_quality_gate_get",
    {
      title: "Get SonarQube Quality Gate",
      description: "根据 SonarQube 项目 URL，返回项目当前质量门禁状态与条件列表。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL")
      },
      outputSchema: projectQualityGateResultSchema
    },
    async ({ projectUrl }) => {
      try {
        const result = await service.getProjectQualityGate(projectUrl);
        return {
          content: [
            {
              type: "text",
              text: formatProjectQualityGateText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "sonarqube_measures_get",
    {
      title: "Get SonarQube Measures",
      description: "根据 SonarQube 项目 URL，返回项目指标值；不传 metricKeys 时使用默认指标集合。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL"),
        metricKeys: z.array(z.string().min(1)).optional().describe(
          `可选指标 key 列表；默认值为 ${SonarQubeFindingService.defaultMeasureKeys.join(", ")}`
        )
      },
      outputSchema: projectMeasuresResultSchema
    },
    async ({ projectUrl, metricKeys }) => {
      try {
        const result = await service.getProjectMeasures(
          projectUrl,
          metricKeys ?? SonarQubeFindingService.defaultMeasureKeys
        );
        return {
          content: [
            {
              type: "text",
              text: formatProjectMeasuresText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "sonarqube_overview_get",
    {
      title: "Get SonarQube Overview",
      description:
        "根据 SonarQube 项目 URL，返回最新官方总览语义下的 7 项 overview 指标；不传 items 时使用环境变量 SONAR_DEFAULT_OVERVIEW_ITEMS。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL"),
        items: z
          .array(z.enum(OVERVIEW_ITEM_VALUES))
          .optional()
          .describe("可选 overview 项列表；不传时使用环境变量默认值")
      },
      outputSchema: projectOverviewResultSchema
    },
    async ({ projectUrl, items }) => {
      try {
        const result = await service.getProjectOverview(projectUrl, items);
        return {
          content: [
            {
              type: "text",
              text: formatProjectOverviewText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "sonarqube_issues_search",
    {
      title: "Search SonarQube Issues",
      description: "根据 SonarQube 项目 URL 和过滤条件搜索 issue，支持分页和详情级别控制。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL"),
        types: z
          .array(z.enum(ISSUE_TYPE_VALUES))
          .optional()
          .describe("可选 issue 类型列表，对齐 `/api/issues/search.types`"),
        impactSoftwareQualities: z
          .array(z.enum(SOFTWARE_QUALITY_VALUES))
          .optional()
          .describe("可选软件质量维度列表，对齐 `/api/issues/search.impactSoftwareQualities`"),
        issueStatuses: z
          .array(z.enum(ISSUE_STATUS_VALUES))
          .optional()
          .describe("可选 issue 状态列表，对齐 `/api/issues/search.issueStatuses`"),
        impactSeverities: z
          .array(z.enum(IMPACT_SEVERITY_VALUES))
          .optional()
          .describe("可选 impact 严重度列表，对齐 `/api/issues/search.impactSeverities`"),
        resolved: z.boolean().optional().describe("可选 resolved 过滤；不传则不过滤"),
        page: z.number().int().min(1).optional().describe("页码，默认 1"),
        pageSize: z.number().int().min(1).max(500).optional().describe(
          `页大小，默认 ${SonarQubeFindingService.defaultIssuesPageSize}`
        ),
        detailLevel: z
          .enum(DETAIL_LEVEL_VALUES)
          .optional()
          .describe("standard 返回标准字段，full 额外带规则说明")
      },
      outputSchema: projectIssuesSearchResultSchema
    },
    async ({
      projectUrl,
      types,
      impactSoftwareQualities,
      issueStatuses,
      impactSeverities,
      resolved,
      page,
      pageSize,
      detailLevel
    }) => {
      try {
        const filters = {
          ...(types ? { types } : {}),
          ...(impactSoftwareQualities ? { impactSoftwareQualities } : {}),
          ...(issueStatuses ? { issueStatuses } : {}),
          ...(impactSeverities ? { impactSeverities } : {}),
          ...(typeof resolved === "boolean" ? { resolved } : {}),
          ...(typeof page === "number" ? { page } : {}),
          ...(typeof pageSize === "number" ? { pageSize } : {}),
          ...(detailLevel ? { detailLevel } : {})
        };
        const result = await service.searchIssues(projectUrl, filters);
        return {
          content: [
            {
              type: "text",
              text: formatProjectIssuesSearchText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "sonarqube_hotspots_search",
    {
      title: "Search SonarQube Hotspots",
      description:
        "根据 SonarQube 项目 URL 和过滤条件搜索 Security Hotspots，支持分页和详情级别控制。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL"),
        status: z
          .enum(HOTSPOT_STATUS_VALUES)
          .optional()
          .describe("可选 Hotspot 状态过滤；对应官方 /api/hotspots/search 的 status"),
        resolution: z
          .enum(HOTSPOT_RESOLUTION_VALUES)
          .optional()
          .describe("可选 Hotspot 处理结论；对应官方 /api/hotspots/search 的 resolution"),
        files: z
          .array(z.string().min(1))
          .optional()
          .describe("可选文件组件 key 列表；对应官方 /api/hotspots/search 的 files"),
        hotspots: z
          .array(z.string().min(1))
          .optional()
          .describe("可选 Hotspot key 列表；对应官方 /api/hotspots/search 的 hotspots"),
        onlyMine: z
          .boolean()
          .optional()
          .describe("可选 onlyMine 过滤；只返回当前用户负责的 Hotspot"),
        inNewCodePeriod: z
          .boolean()
          .optional()
          .describe("可选 inNewCodePeriod 过滤；只返回新代码周期内的 Hotspot"),
        page: z.number().int().min(1).optional().describe("页码，默认 1"),
        pageSize: z.number().int().min(1).optional().describe(
          `页大小，默认 ${SonarQubeFindingService.defaultHotspotsPageSize}`
        ),
        detailLevel: z
          .enum(DETAIL_LEVEL_VALUES)
          .optional()
          .describe("standard 返回标准字段，full 额外补齐规则说明")
      },
      outputSchema: projectHotspotsSearchResultSchema
    },
    async ({
      projectUrl,
      status,
      resolution,
      files,
      hotspots,
      onlyMine,
      inNewCodePeriod,
      page,
      pageSize,
      detailLevel
    }) => {
      try {
        const filters = {
          ...(status ? { status } : {}),
          ...(resolution ? { resolution } : {}),
          ...(files ? { files } : {}),
          ...(hotspots ? { hotspots } : {}),
          ...(typeof onlyMine === "boolean" ? { onlyMine } : {}),
          ...(typeof inNewCodePeriod === "boolean" ? { inNewCodePeriod } : {}),
          ...(typeof page === "number" ? { page } : {}),
          ...(typeof pageSize === "number" ? { pageSize } : {}),
          ...(detailLevel ? { detailLevel } : {})
        };
        const result = await service.searchHotspots(projectUrl, filters);
        return {
          content: [
            {
              type: "text",
              text: formatProjectHotspotsSearchText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "sonarqube_rules_get",
    {
      title: "Get SonarQube Rules",
      description: "根据 SonarQube 项目 URL 与规则 key 列表，返回规则详情。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL"),
        keys: z.array(z.string().min(1)).min(1).describe("规则 key 列表")
      },
      outputSchema: rulesGetResultSchema
    },
    async ({ projectUrl, keys }) => {
      try {
        const result = await service.getRules(projectUrl, keys);
        return {
          content: [
            {
              type: "text",
              text: formatRulesGetText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "sonarqube_components_tree_get",
    {
      title: "Get SonarQube Components Tree",
      description:
        "根据 SonarQube 项目 URL 与组件树过滤条件，返回 SonarQube /api/components/tree 的单页遍历结果。",
      inputSchema: {
        projectUrl: projectUrlInputSchema.describe("SonarQube 项目页面 URL"),
        component: z
          .string()
          .min(1)
          .optional()
          .describe("可选组件树起点；映射官方 /api/components/tree 的 component，默认使用 projectUrl 解析出的 projectKey"),
        strategy: z
          .enum(["all", "children", "leaves"])
          .optional()
          .describe("遍历策略；对应官方 strategy，默认 all"),
        qualifiers: z
          .array(z.enum(["APP", "VW", "SVW", "UTS", "FIL", "DIR", "TRK"]))
          .optional()
          .describe("可选组件限定符过滤列表；对应官方 qualifiers"),
        q: z
          .string()
          .min(3)
          .optional()
          .describe("可选关键字过滤；映射官方 q，官方文档要求至少 3 个字符"),
        sortFields: z
          .array(z.enum(["name", "path", "qualifier"]))
          .optional()
          .describe("排序字段列表；映射官方 s，默认 [\"name\"]"),
        asc: z.boolean().optional().describe("是否升序；映射官方 asc，默认 true"),
        page: z.number().int().min(1).optional().describe("页码，默认 1"),
        pageSize: z.number().int().min(1).max(500).optional().describe(
          `页大小，默认 ${SonarQubeFindingService.defaultComponentsTreePageSize}`
        )
      },
      outputSchema: projectComponentsTreeResultSchema
    },
    async ({ projectUrl, component, strategy, qualifiers, q, sortFields, asc, page, pageSize }) => {
      try {
        const filters = {
          ...(component ? { component } : {}),
          ...(strategy ? { strategy } : {}),
          ...(qualifiers ? { qualifiers } : {}),
          ...(q ? { q } : {}),
          ...(sortFields ? { sortFields } : {}),
          ...(typeof asc === "boolean" ? { asc } : {}),
          ...(typeof page === "number" ? { page } : {}),
          ...(typeof pageSize === "number" ? { pageSize } : {})
        };
        const result = await service.getComponentsTree(projectUrl, filters);
        return {
          content: [
            {
              type: "text",
              text: formatProjectComponentsTreeText(result)
            }
          ],
          structuredContent: result as unknown as Record<string, unknown>
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}

function createErrorResponse(error: unknown): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  const normalized = normalizeError(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: formatErrorForText(normalized)
      }
    ]
  };
}

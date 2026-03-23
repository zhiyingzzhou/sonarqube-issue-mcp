import * as z from "zod/v4";

import {
  findingDetailResultSchema,
  projectComponentsTreeResultSchema,
  projectMeasuresResultSchema,
  projectFindingsResultSchema,
  projectHotspotsSearchResultSchema,
  projectIssuesSearchResultSchema,
  projectOverviewResultSchema,
  projectQualityGateResultSchema,
  rulesGetResultSchema
} from "./schemas.js";

/**
 * 把结构化项目结果压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - 项目级结构化结果。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatProjectFindingsText(
  result: z.infer<typeof projectFindingsResultSchema>
): string {
  return [
    `项目: ${result.project.name} (${result.project.key})`,
    `SonarQube 版本: ${result.project.serverVersion}`,
    ...result.buckets.map((bucket) => `${bucket.label}: ${bucket.count}`),
    `去重总计: ${result.summary.totalFindings}`,
    `详情级别: ${result.summary.detailLevel}`
  ].join("\n");
}

/**
 * 把单条详情压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - 单条问题的结构化详情。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatFindingDetailText(
  result: z.infer<typeof findingDetailResultSchema>
): string {
  return [
    `项目: ${result.project.name} (${result.project.key})`,
    `问题类型: ${result.summary.category}`,
    `规则: ${result.summary.ruleKey}${result.summary.ruleName ? ` - ${result.summary.ruleName}` : ""}`,
    `状态: ${result.summary.status}`,
    `文件: ${result.summary.file ?? "unknown"}${result.summary.line ? `:${result.summary.line}` : ""}`,
    `更新时间: ${result.summary.updatedAt}`,
    `深链: ${result.summary.sonarUrl}`
  ].join("\n");
}

/**
 * 把质量门禁结果压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - 质量门禁结构化结果。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatProjectQualityGateText(
  result: z.infer<typeof projectQualityGateResultSchema>
): string {
  return [
    `项目: ${result.project.name} (${result.project.key})`,
    `Quality Gate: ${result.status}`,
    `条件数: ${result.conditions.length}`,
    `忽略条件: ${result.ignoredConditions ? "yes" : "no"}`,
    `CAYC: ${result.caycStatus ?? "unknown"}`
  ].join("\n");
}

/**
 * 把指标结果压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - 指标结构化结果。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatProjectMeasuresText(
  result: z.infer<typeof projectMeasuresResultSchema>
): string {
  return [
    `项目: ${result.project.name} (${result.project.key})`,
    `指标数: ${result.metricKeys.length}`,
    ...result.measures
      .slice(0, 5)
      .map((measure) => `${measure.metric}: ${measure.value ?? "n/a"}`),
    result.measures.length > 5 ? `其余指标: ${result.measures.length - 5}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 把 overview 结果压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - overview 结构化结果。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatProjectOverviewText(
  result: z.infer<typeof projectOverviewResultSchema>
): string {
  return [
    `项目: ${result.project.name} (${result.project.key})`,
    `总览项数: ${result.items.length}`,
    ...result.items.map((item) => `${item.label}: ${item.value ?? "n/a"}`)
  ].join("\n");
}

/**
 * 把 issue 搜索结果压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - issue 搜索结构化结果。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatProjectIssuesSearchText(
  result: z.infer<typeof projectIssuesSearchResultSchema>
): string {
  return [
    `项目: ${result.project.name} (${result.project.key})`,
    `总数: ${result.paging.total}`,
    `当前页: ${result.paging.page}`,
    `页大小: ${result.paging.pageSize}`,
    `返回条数: ${result.paging.returned}`,
    `详情级别: ${result.filters.detailLevel}`
  ].join("\n");
}

/**
 * 把 Hotspot 搜索结果压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - Hotspot 搜索结构化结果。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatProjectHotspotsSearchText(
  result: z.infer<typeof projectHotspotsSearchResultSchema>
): string {
  return [
    `项目: ${result.project.name} (${result.project.key})`,
    `总数: ${result.paging.total}`,
    `当前页: ${result.paging.page}`,
    `页大小: ${result.paging.pageSize}`,
    `返回条数: ${result.paging.returned}`,
    `状态: ${result.filters.status ?? "all"}`,
    `详情级别: ${result.filters.detailLevel}`
  ].join("\n");
}

/**
 * 把组件树结果压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - 组件树结构化结果。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatProjectComponentsTreeText(
  result: z.infer<typeof projectComponentsTreeResultSchema>
): string {
  return [
    `项目: ${result.project.name} (${result.project.key})`,
    `起点组件: ${result.baseComponent.key}`,
    `策略: ${result.filters.strategy}`,
    `当前页: ${result.paging.page}`,
    `页大小: ${result.paging.pageSize}`,
    `返回节点数: ${result.paging.returned}`,
    `总数: ${result.paging.total}`
  ].join("\n");
}

/**
 * 把规则结果压缩成一段适合 MCP 聊天窗口展示的摘要文本。
 *
 * @param result - 规则结构化结果。
 * @returns 适合直接展示的多行摘要文本。
 */
export function formatRulesGetText(
  result: z.infer<typeof rulesGetResultSchema>
): string {
  return [
    `服务: ${result.origin}`,
    `请求规则数: ${result.requestedKeys.length}`,
    `返回规则数: ${result.rules.length}`,
    ...result.rules.slice(0, 5).map((rule) => `${rule.key}: ${rule.name}`)
  ].join("\n");
}

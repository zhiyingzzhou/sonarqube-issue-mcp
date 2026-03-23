import type { TextRange } from "../types.js";

/**
 * SonarQube 常见分页响应。
 *
 * @remarks
 * `pageIndex/pageSize/total` 的语义在 issue 与 hotspot 接口中保持一致。
 */
export interface SonarPaging {
  /** 当前页码，从 1 开始。 */
  pageIndex: number;
  /** 当前页大小。 */
  pageSize: number;
  /** 总记录数。 */
  total: number;
}

/**
 * SonarQube 中项目、文件、目录等组件的通用描述。
 *
 * @remarks
 * 同一结构会出现在 `components/show`、issue 结果补充和 hotspot 详情里。
 */
export interface SonarProjectComponent {
  /** 组件 key。 */
  key: string;
  /** 组件短名。 */
  name: string;
  /** 组件长名。 */
  longName?: string;
  /** 组件限定符，例如 `TRK` 或 `FIL`。 */
  qualifier?: string;
  /** 相对路径；文件组件常见。 */
  path?: string;
  /** 所属项目 key；某些搜索接口会返回。 */
  project?: string;
  /** 组件描述；项目级组件常见。 */
  description?: string;
  /** 组件标签；项目级组件常见。 */
  tags?: string[];
  /** 可见性；项目级组件常见。 */
  visibility?: string;
  /** 是否启用 AI CodeFix；项目级组件常见。 */
  isAiCodeFixEnabled?: boolean;
  /** 组件是否启用；部分接口会返回。 */
  enabled?: boolean;
}

/**
 * `/api/components/show` 返回结构。
 *
 * @remarks
 * 这里只声明当前服务实际用到的字段。
 */
export interface SonarComponentShowResponse {
  /** 当前查询到的组件。 */
  component: SonarProjectComponent;
}

/**
 * SonarQube 新版 impacts 字段中的单条影响记录。
 *
 * @remarks
 * 用于从新版质量模型中推导更贴近业务语义的严重级别。
 */
export interface SonarImpact {
  /** 软件质量维度。 */
  softwareQuality: string;
  /** 严重程度。 */
  severity: string;
}

/**
 * issue 评论的最小结构。
 *
 * @remarks
 * 不追求完整覆盖，只保留当前服务有机会透传给上层的字段。
 */
export interface SonarIssueComment {
  /** 评论 key。 */
  key?: string;
  /** 评论作者登录名。 */
  login?: string;
  /** HTML 形式的评论内容。 */
  htmlText?: string;
  /** Markdown 形式的评论内容。 */
  markdown?: string;
  /** 当前用户是否可编辑。 */
  updatable?: boolean;
  /** 评论创建时间。 */
  createdAt?: string;
}

/**
 * `/api/issues/search` 中的单条 issue。
 *
 * @remarks
 * 字段是按当前标准化需求裁剪过的，不是 Sonar 官方完整模型镜像。
 */
export interface SonarIssue {
  /** issue key。 */
  key: string;
  /** 规则 key。 */
  rule: string;
  /** 旧版严重度字段。 */
  severity?: string;
  /** SonarQube 原始 issue 类型。 */
  type?: string;
  /** 组件 key，通常包含项目 key 和相对路径。 */
  component: string;
  /** 项目 key。 */
  project?: string;
  /** 所在行号。 */
  line?: number;
  /** 文本范围。 */
  textRange?: TextRange;
  /** 数据流或执行流信息。 */
  flows?: unknown[];
  /**
   * 旧处理结果字段。
   *
   * @remarks
   * 与 `status` 一样，这一组旧 workflow 语义仍可能继续返回，
   * 但 `/api/issues/search` 自 10.4 起已经引入 `issueStatus` 作为现行统一状态字段。
   */
  resolution?: string;
  /**
   * 旧 workflow 状态。
   *
   * @remarks
   * 该字段仍可能与 `resolution` 一起返回，
   * 但 SonarQube 官方当前更推荐消费 `issueStatus`。
   */
  status: string;
  /**
   * 新版统一 issue 状态。
   *
   * @remarks
   * 根据 `/api/issues/search` changelog，`issueStatus` 是 10.4 引入的现行状态字段，
   * `status/resolution` 仍可能同时返回以兼容旧消费方。
   */
  issueStatus?: string;
  /** 问题消息。 */
  message: string;
  /** 富文本消息格式化信息；9.8 起加入响应。 */
  messageFormattings?: unknown[];
  /** 估算工作量。 */
  effort?: string;
  /** 技术债务字段。 */
  debt?: string;
  /** 问题作者。 */
  author?: string;
  /** 问题负责人。 */
  assignee?: string;
  /** 标签列表。 */
  tags?: string[];
  /** 创建时间。 */
  creationDate: string;
  /** 最后更新时间。 */
  updateDate: string;
  /** 关闭时间。 */
  closeDate?: string;
  /** Clean Code 属性。 */
  cleanCodeAttribute?: string;
  /** Clean Code 属性分类；10.2 起加入响应。 */
  cleanCodeAttributeCategory?: string;
  /** 新版质量影响列表。 */
  impacts?: SonarImpact[];
  /** Sonar 内部标签；2025.5 起加入响应。 */
  internalTags?: string[];
  /** 代码变体；10.1 起加入响应。 */
  codeVariants?: string[];
  /** 评论列表。 */
  comments?: SonarIssueComment[];
}

/**
 * issue search / rule show 中共用的规则摘要结构。
 *
 * @remarks
 * 列表接口只会返回摘要，详情接口会补齐 `descriptionSections` 等字段。
 * 2026.2 起匿名用户访问时，描述相关字段会被官方混淆。
 */
export interface SonarIssueRuleSummary {
  /** 规则 key。 */
  key: string;
  /** 规则名称。 */
  name: string;
  /** 语言标识。 */
  lang?: string;
  /** 规则严重度。 */
  severity?: string;
  /** 规则类型。 */
  type?: string;
  /**
   * 结构化规则描述分段。
   *
   * @remarks
   * 根据 `/api/rules/show` 官方 changelog，`descriptionSections` 是 9.5 起的现行描述字段。
   */
  descriptionSections?: SonarRuleDescriptionSection[];
  /** Markdown 规则描述；部分实例仍可能返回。 */
  mdDesc?: string;
  /** 已废弃的 HTML 规则描述；2025.1 起官方说明不再返回。 */
  htmlDesc?: string;
  /** Clean Code 属性。 */
  cleanCodeAttribute?: string;
  /** Clean Code 属性分类。 */
  cleanCodeAttributeCategory?: string;
  /** 新版质量影响列表。 */
  impacts?: SonarImpact[];
  /** 标签。 */
  tags?: string[];
  /** 系统标签。 */
  sysTags?: string[];
}

/**
 * 规则描述分段上下文。
 *
 * @remarks
 * 结构来自 SonarQube `descriptionSections.context`。
 */
export interface SonarRuleDescriptionContext {
  /** 上下文 key。 */
  key: string;
  /** 上下文展示名。 */
  displayName: string;
}

/**
 * 规则描述分段。
 *
 * @remarks
 * 最新 SonarQube 会把规则描述拆成多个 HTML section，而不是单一 `htmlDesc`。
 */
export interface SonarRuleDescriptionSection {
  /** section 唯一 key，例如 introduction / how-to-fix。 */
  key: string;
  /** 当前 section 的 HTML 内容。 */
  content: string;
  /** section 上下文，例如框架或运行环境。 */
  context?: SonarRuleDescriptionContext;
}

/**
 * `/api/issues/search` 返回结构。
 *
 * @remarks
 * `rules/components/users` 等补充块在不同 Sonar 版本中可能裁剪，但这里统一做可选处理。
 * 8.2 起该接口不再返回 Security Hotspot，相关数据必须改走 `api/hotspots/*`。
 */
export interface SonarIssueSearchResponse {
  /** 分页信息。 */
  paging: SonarPaging;
  /** issue 列表。 */
  issues: SonarIssue[];
  /** 规则摘要列表。 */
  rules?: SonarIssueRuleSummary[];
  /** 组件补充信息。 */
  components?: SonarProjectComponent[];
  /** 用户补充信息。 */
  users?: unknown[];
}

/**
 * `/api/issues/changelog` 中的单次变更记录。
 *
 * @remarks
 * 变更明细字段比较松散，因此保留为最小兼容结构。
 * 10.4 起 `issueStatus` 会出现在差异字段里，而旧 `status/resolution/severity/type` 被官方标记为 deprecated。
 */
export interface SonarIssueChangelogEntry {
  /** 本次变更创建时间。 */
  creationDate?: string;
  /** 变更发起人。 */
  user?: string;
  /** 字段变更列表。 */
  diffs?: Array<{
    /** 变更字段名。 */
    key?: string;
    /** 变更后的值。 */
    newValue?: string;
    /** 变更前的值。 */
    oldValue?: string;
  }>;
}

/**
 * `/api/issues/changelog` 返回结构。
 *
 * @remarks
 * 当前只需要 `changelog` 数组本身。
 */
export interface SonarIssueChangelogResponse {
  /** 全量 changelog 列表。 */
  changelog: SonarIssueChangelogEntry[];
}

/**
 * `/api/rules/show` 返回结构。
 *
 * @remarks
 * 规则详情接口是列表结果补全描述、修复建议等信息的主要来源。
 * 现行描述字段是 `descriptionSections`，且 2026.2 起匿名访问时描述相关字段会被混淆。
 */
export interface SonarRuleDetailsResponse {
  /** 规则详情主体。 */
  rule: SonarIssueRuleSummary & {
    /** HTML 备注。 */
    htmlNote?: string;
    /** 备注作者。 */
    noteLogin?: string;
    /** 备注原始数据。 */
    noteData?: string;
    /** 修复函数类型；10.0 后的现行字段名，替代旧 `debtRemFnType`。 */
    remFnType?: string;
    /** 修复函数 gap 乘数；10.0 后的现行字段名，替代旧 `debtRemFnCoeff`。 */
    remFnGapMultiplier?: string;
    /** 修复函数基础工作量；10.0 后的现行字段名，替代旧 `debtRemFnOffset`。 */
    remFnBaseEffort?: string;
    /** 是否重载修复函数；10.0 后的现行字段名，替代旧 `debtOverloaded`。 */
    remFnOverloaded?: boolean;
    /** 默认修复函数类型；10.0 后的现行字段名，替代旧 `defaultDebtRemFnType`。 */
    defaultRemFnType?: string;
    /** 默认修复函数 gap 乘数；10.0 后的现行字段名，替代旧 `defaultDebtRemFnCoeff`。 */
    defaultRemFnGapMultiplier?: string;
    /** 默认修复函数基础工作量；10.0 后的现行字段名，替代旧 `defaultDebtRemFnOffset`。 */
    defaultRemFnBaseEffort?: string;
    /** 教育原则。 */
    educationPrinciples?: string[];
  };
  /** 激活配置列表。 */
  actives?: unknown[];
}

/**
 * `/api/hotspots/search` 中的单条热点摘要。
 *
 * @remarks
 * 列表接口不含完整规则说明，因此后续通常还会调用 `show` 补详情。
 */
export interface SonarHotspotSearchItem {
  /** hotspot key。 */
  key: string;
  /** 规则 key。 */
  ruleKey: string;
  /** 组件 key。 */
  component: string;
  /** 项目 key。 */
  project?: string;
  /** 安全分类，例如 `auth`。 */
  securityCategory?: string;
  /** 所在行号。 */
  line?: number;
  /** 问题消息。 */
  message: string;
  /** 当前状态。 */
  status: string;
  /** 当前结论。 */
  resolution?: string;
  /** 作者。 */
  author?: string;
  /** 负责人。 */
  assignee?: string;
  /** 创建时间。 */
  creationDate: string;
  /** 最后更新时间。 */
  updateDate: string;
  /** 风险概率。 */
  vulnerabilityProbability?: string;
  /** 文本范围。 */
  textRange?: TextRange;
  /** 数据流/执行流。 */
  flows?: unknown[];
  /** 富文本消息格式化信息。 */
  messageFormattings?: unknown[];
}

/**
 * `/api/hotspots/search` 返回结构。
 *
 * @remarks
 * 与 issue 列表一样采用分页返回。
 */
export interface SonarHotspotSearchResponse {
  /** 分页信息。 */
  paging: SonarPaging;
  /** hotspot 列表。 */
  hotspots: SonarHotspotSearchItem[];
  /** 组件补充信息。 */
  components?: SonarProjectComponent[];
}

/**
 * hotspot 详情中携带的规则信息。
 *
 * @remarks
 * 相比普通 rule summary，hotspot 规则更关注风险说明与修复建议。
 * 但根据 `/api/hotspots/show` 官方 changelog，这些描述字段自 9.5 起已 deprecated，
 * 官方建议改用 `/api/rules/show` 获取规则描述。
 */
export interface SonarHotspotRule {
  /** 规则 key。 */
  key: string;
  /** 规则名称。 */
  name: string;
  /** SonarSource 安全分类。 */
  securityCategory?: string;
  /** 漏洞概率。 */
  vulnerabilityProbability?: string;
  /** 风险说明。 */
  riskDescription?: string;
  /** 漏洞说明。 */
  vulnerabilityDescription?: string;
  /** 修复建议。 */
  fixRecommendations?: string;
}

/**
 * `/api/hotspots/show` 返回结构。
 *
 * @remarks
 * 这是 Security Hotspot 详情接口的核心结构，后续会被标准化成统一 FindingSummary。
 */
export interface SonarHotspotShowResponse {
  /** hotspot key。 */
  key: string;
  /** 所在行号。 */
  line?: number;
  /** 问题消息。 */
  message: string;
  /** 当前状态。 */
  status: string;
  /** 当前处理结论。 */
  resolution?: string;
  /** 作者。 */
  author?: string;
  /** 负责人。 */
  assignee?: string;
  /** 创建时间。 */
  creationDate: string;
  /** 最后更新时间。 */
  updateDate: string;
  /** 文本范围。 */
  textRange?: TextRange;
  /** 数据流/执行流。 */
  flows?: unknown[];
  /** 富文本消息格式化信息。 */
  messageFormattings?: unknown[];
  /** 评论列表。 */
  comment?: unknown[];
  /** 变更记录。 */
  changelog?: unknown[];
  /** 文件组件信息。 */
  component: SonarProjectComponent;
  /** 项目信息。 */
  project: SonarProjectComponent;
  /** 规则详情。 */
  rule: SonarHotspotRule;
  /** 代码变体信息。 */
  codeVariants?: string[];
}

/**
 * 质量门禁中的单条条件。
 */
export interface SonarQualityGateCondition {
  /** 当前条件状态。 */
  status: string;
  /** 指标 key。 */
  metricKey: string;
  /** 比较器，例如 `LT`、`GT`；某些条件可能没有比较器。 */
  comparator?: string;
  /** 阈值。 */
  errorThreshold?: string;
  /** 实际值；部分条件没有实时值时可能缺失。 */
  actualValue?: string;
}

/**
 * 质量门禁周期信息。
 */
export interface SonarQualityGatePeriod {
  /** 周期模式，例如 `PREVIOUS_VERSION`。 */
  mode?: string;
  /** 周期日期。 */
  date?: string;
  /** 附加参数，例如版本号或自定义周期参数。 */
  parameter?: string;
}

/**
 * `/api/qualitygates/project_status` 返回结构。
 *
 * @remarks
 * 10.0 起官方只保留 `period`，旧 `periods` / `periodIndex` 已移除。
 */
export interface SonarQualityGateProjectStatusResponse {
  /** 项目质量门禁主体。 */
  projectStatus: {
    /** 总体状态。 */
    status: string;
    /** 条件列表。 */
    conditions?: SonarQualityGateCondition[];
    /** 是否忽略了部分条件。 */
    ignoredConditions?: boolean;
    /** 周期信息。 */
    period?: SonarQualityGatePeriod;
    /** Clean as You Code 状态，例如 `compliant`、`non-compliant`。 */
    caycStatus?: string;
  };
}

/**
 * 单条项目指标值。
 */
export interface SonarMeasure {
  /** 指标 key。 */
  metric: string;
  /** 当前值；为字符串，调用方需要自行决定是否转成数值。 */
  value?: string;
  /** 是否最佳值。 */
  bestValue?: boolean;
}

/**
 * `/api/measures/component` 返回结构。
 *
 * @remarks
 * 当前官方 `additionalFields` 仅接受 `metrics`、`period`。
 * 底层 `component.measures` 的返回顺序不保证等于请求 `metricKeys` 顺序。
 */
export interface SonarMeasuresComponentResponse {
  /** 当前组件。 */
  component: SonarProjectComponent & {
    /** 项目描述。 */
    description?: string;
    /** 指标列表。 */
    measures?: SonarMeasure[];
  };
}

/**
 * `/api/components/tree` 返回结构。
 *
 * @remarks
 * `baseComponent` 表示当前遍历起点，`components` 为按 strategy 返回的后代节点。
 */
export interface SonarComponentsTreeResponse {
  /** 分页信息。 */
  paging: SonarPaging;
  /** 当前遍历起点。 */
  baseComponent: SonarProjectComponent;
  /** 当前页组件列表。 */
  components: SonarProjectComponent[];
}

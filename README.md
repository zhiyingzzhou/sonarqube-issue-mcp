# SonarQube Issue MCP

一个基于 SonarQube Web API 的 MCP 服务。

输入一个 SonarQube 项目页面 URL，这个服务会帮你做几件事：

- 拉当前待处理的 findings 列表
- 拉项目总览指标
- 查单条 issue / hotspot 详情
- 查 quality gate、measures、rules、components tree

它只走 SonarQube Web API，不依赖页面结构，也不做浏览器抓取。

## 先说几个约定

- 这是一个 `stdio` MCP server，不是交互式 CLI
- 平时应该由 MCP 客户端拉起，不是手工在终端里直接用
- 运行环境要求 Node.js `>= 20`
- 机器需要能访问 SonarQube；如果公司内网有隔离，就配 `SONAR_HTTP_PROXY`

## 接入方式

### 1. 直接用 `npx`

```json
{
  "mcpServers": {
    "sonarqube-issue": {
      "command": "npx",
      "args": [
        "-y",
        "sonarqube-issue-mcp@latest"
      ],
      "env": {
        "SONAR_TOKEN": "your_sonar_token",
        "SONAR_HTTP_PROXY": "http://127.0.0.1:7890"
      }
    }
  }
}
```

如果你准备长期用，建议固定版本，不要一直跟裸 `latest`。

### 2. 全局安装后使用

先安装：

```bash
npm install -g sonarqube-issue-mcp
```

再配置：

```json
{
  "mcpServers": {
    "sonarqube-issue": {
      "command": "sonarqube-issue-mcp",
      "env": {
        "SONAR_TOKEN": "your_sonar_token",
        "SONAR_HTTP_PROXY": "http://127.0.0.1:7890"
      }
    }
  }
}
```

### 3. 本地源码方式

适合本地开发或调试。

```json
{
  "mcpServers": {
    "sonarqube-issue": {
      "command": "node",
      "args": [
        "/path/to/sonarqube-issue-mcp/dist/index.js"
      ],
      "env": {
        "SONAR_TOKEN": "your_sonar_token",
        "SONAR_HTTP_PROXY": "http://127.0.0.1:7890"
      }
    }
  }
}
```

这里不要写 `pnpm start`。`stdio` 服务如果往 `stdout` 多打东西，握手就会失败。

## 环境变量

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `SONAR_TOKEN` | 是 | SonarQube token |
| `SONAR_REQUEST_TIMEOUT_MS` | 否 | 请求超时，默认 `20000` |
| `SONAR_RETRY_COUNT` | 否 | 重试次数，默认 `2` |
| `SONAR_HTTP_PROXY` | 否 | SonarQube API 代理，例如 `http://127.0.0.1:7890` |
| `SONAR_DEFAULT_FINDING_CATEGORIES` | 否 | findings 默认分桶，默认 `security,reliability,security-hotspot` |
| `SONAR_DEFAULT_OVERVIEW_ITEMS` | 否 | overview 默认项，默认 `security,reliability,maintainability,accepted-issues,coverage,duplications,security-hotspots` |

`SONAR_DEFAULT_FINDING_CATEGORIES` 允许值：

- `security`
- `reliability`
- `maintainability`
- `security-hotspot`

`SONAR_DEFAULT_OVERVIEW_ITEMS` 允许值：

- `security`
- `reliability`
- `maintainability`
- `accepted-issues`
- `coverage`
- `duplications`
- `security-hotspots`

## 项目 URL 规则

所有工具都只接收一个 `projectUrl`。

例如：

```text
https://sonarqube.example.com/dashboard?id=example-project&branch=main
```

服务会自动从 URL 里解析：

- `origin`
- `id -> projectKey`
- `branch`
- `pullRequest`

这些页面都可以：

- `https://sonarqube.example.com/dashboard?id=example-project`
- `https://sonarqube.example.com/project/overview?id=example-project&branch=main`
- `https://sonarqube.example.com/project/issues?id=example-project&pullRequest=123`
- `https://sonarqube.example.com/security_hotspots?id=example-project`

这些不行：

- `https://sonarqube.example.com/`
- `https://sonarqube.example.com/dashboard`

## findings 和 overview 的口径

这两个概念是分开的，不要混着理解。

### findings

`sonarqube_findings_list` 返回的是问题列表，不是总览指标。

默认分三桶：

- `security`
- `reliability`
- `security-hotspot`

对应的查询口径是：

- `security` -> `/api/issues/search?impactSoftwareQualities=SECURITY&resolved=false`
- `reliability` -> `/api/issues/search?impactSoftwareQualities=RELIABILITY&resolved=false`
- `maintainability` -> `/api/issues/search?impactSoftwareQualities=MAINTAINABILITY&resolved=false`
- `security-hotspot` -> `/api/hotspots/search?status=TO_REVIEW`

注意：`Security Hotspots` 不是 `/api/issues/search.types` 里的一种 type，它始终走 `/api/hotspots/*`。

### overview

`sonarqube_overview_get` 返回的是总览指标，默认 7 项：

- `security` -> `software_quality_security_issues`
- `reliability` -> `software_quality_reliability_issues`
- `maintainability` -> `software_quality_maintainability_issues`
- `accepted-issues` -> `accepted_issues`
- `coverage` -> `coverage`
- `duplications` -> `duplicated_lines_density`
- `security-hotspots` -> `security_hotspots`

## Tools

### `sonarqube_findings_list`

按配置分桶返回当前待处理 findings。

输入示例：

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main",
  "detailLevel": "standard"
}
```

返回里最关键的字段：

- `project`
- `summary.requestedCategories`
- `summary.totalFindings`
- `buckets`

这里已经彻底切到动态 `buckets` 结构，不再返回旧的固定三数组。

### `sonarqube_overview_get`

返回总览指标。

输入示例：

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main",
  "items": ["security", "coverage", "security-hotspots"]
}
```

如果不传 `items`，就用 `SONAR_DEFAULT_OVERVIEW_ITEMS`。

### `sonarqube_finding_get`

查单条 issue 或 hotspot 详情。

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main",
  "kind": "issue",
  "key": "ISSUE-KEY"
}
```

### `sonarqube_quality_gate_get`

查项目当前 quality gate。

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main"
}
```

### `sonarqube_measures_get`

查任意指标。

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main",
  "metricKeys": [
    "alert_status",
    "software_quality_security_issues",
    "accepted_issues",
    "coverage"
  ]
}
```

如果不传 `metricKeys`，默认会查：

- `alert_status`
- `accepted_issues`
- `coverage`
- `duplicated_lines_density`
- `ncloc`
- `security_hotspots`
- `software_quality_security_issues`
- `software_quality_reliability_issues`
- `software_quality_maintainability_issues`

### `sonarqube_issues_search`

通用 issue 搜索。

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main",
  "types": ["BUG", "CODE_SMELL"],
  "impactSoftwareQualities": ["RELIABILITY", "MAINTAINABILITY"],
  "issueStatuses": ["OPEN"],
  "impactSeverities": ["HIGH", "MEDIUM"],
  "resolved": false,
  "page": 1,
  "pageSize": 50,
  "detailLevel": "standard"
}
```

几点需要注意：

- `types`、`impactSoftwareQualities`、`impactSeverities` 是三套不同过滤条件
- `issueStatuses` 是现行参数，不再暴露旧 `statuses`
- `impactSoftwareQualities` 只接受 `SECURITY / RELIABILITY / MAINTAINABILITY`
- `impactSeverities` 只接受 `INFO / LOW / MEDIUM / HIGH / BLOCKER`
- 旧状态值例如 `RESOLVED / CLOSED / REOPENED` 会直接在 MCP 层校验失败

### `sonarqube_hotspots_search`

通用 Security Hotspot 搜索。

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main",
  "status": "TO_REVIEW",
  "resolution": "SAFE",
  "files": ["example-project:src/config.ts"],
  "hotspots": ["HOTSPOT-KEY"],
  "onlyMine": false,
  "inNewCodePeriod": true,
  "page": 1,
  "pageSize": 100,
  "detailLevel": "standard"
}
```

### `sonarqube_components_tree_get`

查 `/api/components/tree` 单页结果。

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main",
  "component": "example-project:src",
  "strategy": "children",
  "qualifiers": ["DIR", "FIL"],
  "q": "settings",
  "sortFields": ["path"],
  "asc": true,
  "page": 1,
  "pageSize": 100
}
```

### `sonarqube_rules_get`

批量查规则详情。

```json
{
  "projectUrl": "https://sonarqube.example.com/dashboard?id=example-project&branch=main",
  "keys": ["typescript:S1874", "js:S2068"]
}
```

## 本地开发

安装依赖：

```bash
pnpm install
```

开发模式：

```bash
pnpm dev
```

构建：

```bash
pnpm build
```

本地启动：

```bash
SONAR_TOKEN=your_token pnpm start
```

如果 SonarQube API 需要代理：

```bash
SONAR_TOKEN=your_token \
SONAR_HTTP_PROXY=http://127.0.0.1:7890 \
pnpm start
```

如果你要把本地源码接进 MCP 客户端，直接跑 `node dist/index.js`，不要在客户端配置里写 `pnpm start`。

## 测试

```bash
pnpm test
```

当前测试覆盖这些主链路：

- URL 解析
- 配置校验
- 503 错误映射
- findings 分桶
- overview 查询
- issue / hotspot 详情
- quality gate
- measures
- issue 搜索
- hotspot 搜索
- components tree
- rules

## 设计取舍

- 主链路只走 SonarQube Web API
- 对 401 / 403 / 404 / 503 都有明确错误映射
- 不做多版本 SonarQube 向后兼容层

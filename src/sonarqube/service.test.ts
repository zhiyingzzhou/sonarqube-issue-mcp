import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config.js";
import type { IssueSearchFilters } from "../types.js";
import { SonarQubeFindingService } from "./service.js";

const PROJECT_KEY = "example-project";
const ORIGIN = "https://sonarqube.example.com";
const PROJECT_URL = `${ORIGIN}/dashboard?id=${PROJECT_KEY}`;

/**
 * service 层测试保护“聚合、标准化、详情补全”这条主业务链路。
 */
describe("SonarQubeFindingService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", createFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("能聚合三类问题并补齐规则详情", async () => {
    const service = new SonarQubeFindingService(createConfig());
    const result = await service.getProjectFindings(PROJECT_URL, "full");

    expect(result.project).toMatchObject({
      origin: ORIGIN,
      key: PROJECT_KEY,
      name: PROJECT_KEY,
      serverVersion: "10.8.1"
    });
    expect(result.summary).toEqual({
      requestedCategories: ["security", "reliability", "security-hotspot"],
      totalFindings: 3,
      detailLevel: "full"
    });
    expect(result.buckets).toHaveLength(3);
    expect(result.buckets[0]).toMatchObject({
      category: "security",
      label: "Security",
      count: 1
    });
    expect(result.buckets[0]?.items[0]).toMatchObject({
      key: "ISSUE-SEC",
      category: "security",
      ruleKey: "js:S5131",
      ruleName: "Potential XSS",
      severity: "HIGH",
      ruleDescription: "Security rule markdown",
      sonarUrl: `${ORIGIN}/project/issues?id=${PROJECT_KEY}&open=ISSUE-SEC`
    });
    expect(result.buckets[1]?.items[0]).toMatchObject({
      key: "ISSUE-BUG",
      category: "reliability",
      ruleKey: "ts:S2259",
      ruleDescription: "Reliability rule markdown"
    });
    expect(result.buckets[2]?.items[0]).toMatchObject({
      key: "HOT-1",
      category: "security-hotspot",
      ruleKey: "js:S2068",
      ruleName: "Credentials should not be hard-coded",
      vulnerabilityProbability: "HIGH",
      ruleDescription: "Hotspot rule markdown",
      riskDescription: "Hotspot risk",
      fixRecommendations: "Hotspot fix"
    });
  });

  it("能返回 issue 和 hotspot 的单条详情", async () => {
    const service = new SonarQubeFindingService(createConfig());

    const issueDetail = await service.getFindingDetail(PROJECT_URL, "issue", "ISSUE-SEC");
    expect(issueDetail.summary.category).toBe("security");
    expect(issueDetail.changelog).toHaveLength(1);
    expect(issueDetail.summary.ruleDescription).toBe("Security rule markdown");

    const hotspotDetail = await service.getFindingDetail(PROJECT_URL, "hotspot", "HOT-1");
    expect(hotspotDetail.summary.category).toBe("security-hotspot");
    expect(hotspotDetail.comments).toHaveLength(1);
    expect(hotspotDetail.summary.fixRecommendations).toBe("Hotspot fix");
  });

  it("standard 模式不会为 hotspot 列表额外拉详情", async () => {
    vi.stubGlobal("fetch", createFetchMock({ forbidHotspotShow: true }));

    const service = new SonarQubeFindingService(createConfig());
    const result = await service.getProjectFindings(PROJECT_URL, "standard");

    expect(result.summary.detailLevel).toBe("standard");
    expect(result.buckets[2]?.items[0]).toMatchObject({
      key: "HOT-1",
      category: "security-hotspot",
      file: "src/config.ts",
      ruleDescription: null,
      riskDescription: null,
      fixRecommendations: null
    });
  });

  it("会根据配置改为抓取 maintainability 分桶", async () => {
    const service = new SonarQubeFindingService(
      createConfig({
        sonarDefaultFindingCategories: ["maintainability", "security-hotspot"]
      })
    );
    const result = await service.getProjectFindings(PROJECT_URL, "full");

    expect(result.summary).toEqual({
      requestedCategories: ["maintainability", "security-hotspot"],
      totalFindings: 2,
      detailLevel: "full"
    });
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets[0]).toMatchObject({
      category: "maintainability",
      label: "Maintainability",
      count: 1
    });
    expect(result.buckets[0]?.items[0]).toMatchObject({
      key: "ISSUE-MAINT",
      category: "maintainability",
      ruleKey: "ts:S1481",
      severity: "LOW",
      ruleDescription: "Maintainability rule markdown"
    });
    expect(result.buckets[1]).toMatchObject({
      category: "security-hotspot",
      count: 1
    });
  });

  it("能返回项目质量门禁状态", async () => {
    const service = new SonarQubeFindingService(createConfig());
    const result = await service.getProjectQualityGate(PROJECT_URL);

    expect(result.project).toMatchObject({
      origin: ORIGIN,
      key: PROJECT_KEY
    });
    expect(result.status).toBe("OK");
    expect(result.caycStatus).toBe("compliant");
    expect(result.period).toMatchObject({
      mode: "PREVIOUS_VERSION"
    });
    expect(result.conditions[0]).toMatchObject({
      metricKey: "new_coverage",
      comparator: "LT",
      errorThreshold: "80",
      actualValue: "92.6"
    });
  });

  it("能按请求顺序返回项目指标", async () => {
    const service = new SonarQubeFindingService(createConfig());
    const result = await service.getProjectMeasures(PROJECT_URL, ["alert_status", "coverage", "bugs"]);

    expect(result.project).toMatchObject({
      origin: ORIGIN,
      key: PROJECT_KEY
    });
    expect(result.metricKeys).toEqual(["alert_status", "coverage", "bugs"]);
    expect(result.measures).toEqual([
      {
        metric: "alert_status",
        value: "OK",
        bestValue: null
      },
      {
        metric: "coverage",
        value: "87.8",
        bestValue: false
      },
      {
        metric: "bugs",
        value: "0",
        bestValue: true
      }
    ]);
  });

  it("能返回最新总览语义的 7 项指标", async () => {
    const service = new SonarQubeFindingService(createConfig());
    const result = await service.getProjectOverview(PROJECT_URL);

    expect(result.requestedItems).toEqual([
      "security",
      "reliability",
      "maintainability",
      "accepted-issues",
      "coverage",
      "duplications",
      "security-hotspots"
    ]);
    expect(result.items).toEqual([
      {
        key: "security",
        label: "Security",
        metricKey: "software_quality_security_issues",
        value: "1",
        bestValue: false
      },
      {
        key: "reliability",
        label: "Reliability",
        metricKey: "software_quality_reliability_issues",
        value: "1",
        bestValue: false
      },
      {
        key: "maintainability",
        label: "Maintainability",
        metricKey: "software_quality_maintainability_issues",
        value: "2",
        bestValue: false
      },
      {
        key: "accepted-issues",
        label: "Accepted Issues",
        metricKey: "accepted_issues",
        value: "2",
        bestValue: false
      },
      {
        key: "coverage",
        label: "Coverage",
        metricKey: "coverage",
        value: "87.8",
        bestValue: false
      },
      {
        key: "duplications",
        label: "Duplications",
        metricKey: "duplicated_lines_density",
        value: "1.2",
        bestValue: true
      },
      {
        key: "security-hotspots",
        label: "Security Hotspots",
        metricKey: "security_hotspots",
        value: "1",
        bestValue: false
      }
    ]);
  });

  it("能按过滤条件搜索 issue", async () => {
    const service = new SonarQubeFindingService(createConfig());
    const result = await service.searchIssues(PROJECT_URL, {
      types: ["CODE_SMELL"],
      impactSoftwareQualities: ["MAINTAINABILITY"],
      impactSeverities: ["LOW"],
      issueStatuses: ["ACCEPTED"],
      resolved: true,
      page: 1,
      pageSize: 2,
      detailLevel: "full"
    });

    expect(result.filters).toMatchObject({
      types: ["CODE_SMELL"],
      impactSoftwareQualities: ["MAINTAINABILITY"],
      impactSeverities: ["LOW"],
      issueStatuses: ["ACCEPTED"],
      resolved: true,
      page: 1,
      pageSize: 2,
      detailLevel: "full"
    });
    expect(result.paging).toEqual({
      page: 1,
      pageSize: 2,
      total: 2,
      returned: 2
    });
    expect(result.issues[0]).toMatchObject({
      key: "ISSUE-GENERIC-1",
      type: "CODE_SMELL",
      ruleKey: "typescript:S1874",
      ruleName: "Deprecated APIs should not be used",
      status: "ACCEPTED",
      issueStatus: "ACCEPTED",
      severity: "LOW",
      ruleDescription: "Generic rule markdown"
    });
  });

  it("会拒绝旧 issue 状态枚举值", async () => {
    const service = new SonarQubeFindingService(createConfig());

    await expect(
      service.searchIssues(PROJECT_URL, {
        // 故意绕过 TS 静态枚举校验，验证运行时对旧状态值的拒绝逻辑。
        issueStatuses: ["RESOLVED"] as unknown as IssueSearchFilters["issueStatuses"]
      })
    ).rejects.toMatchObject({
      code: "VALIDATION"
    });
  });

  it("会拒绝旧 issue 严重度枚举值", async () => {
    const service = new SonarQubeFindingService(createConfig());

    await expect(
      service.searchIssues(PROJECT_URL, {
        // 故意绕过 TS 静态枚举校验，验证运行时对旧严重度值的拒绝逻辑。
        impactSeverities: ["CRITICAL"] as unknown as IssueSearchFilters["impactSeverities"]
      })
    ).rejects.toMatchObject({
      code: "VALIDATION"
    });
  });

  it("能按过滤条件搜索 hotspot", async () => {
    const service = new SonarQubeFindingService(createConfig());
    const result = await service.searchHotspots(PROJECT_URL, {
      status: "REVIEWED",
      resolution: "SAFE",
      files: [`${PROJECT_KEY}:src/config.ts`],
      hotspots: ["HOT-REVIEWED-1"],
      onlyMine: false,
      inNewCodePeriod: true,
      page: 1,
      pageSize: 2,
      detailLevel: "full"
    });

    expect(result.filters).toMatchObject({
      status: "REVIEWED",
      resolution: "SAFE",
      files: [`${PROJECT_KEY}:src/config.ts`],
      hotspots: ["HOT-REVIEWED-1"],
      onlyMine: false,
      inNewCodePeriod: true,
      page: 1,
      pageSize: 2,
      detailLevel: "full"
    });
    expect(result.paging).toEqual({
      page: 1,
      pageSize: 2,
      total: 1,
      returned: 1
    });
    expect(result.hotspots[0]).toMatchObject({
      key: "HOT-REVIEWED-1",
      ruleKey: "js:S2068",
      ruleName: "Credentials should not be hard-coded",
      securityCategory: "auth",
      status: "REVIEWED",
      resolution: "SAFE",
      vulnerabilityProbability: "HIGH",
      file: "src/config.ts",
      ruleDescription: "Hotspot rule markdown"
    });
  });

  it("能获取组件树单页结果", async () => {
    const service = new SonarQubeFindingService(createConfig());
    const result = await service.getComponentsTree(PROJECT_URL, {
      component: `${PROJECT_KEY}:src`,
      strategy: "children",
      qualifiers: ["DIR", "FIL"],
      sortFields: ["path"],
      asc: false,
      page: 1,
      pageSize: 2
    });

    expect(result.filters).toEqual({
      component: `${PROJECT_KEY}:src`,
      strategy: "children",
      qualifiers: ["DIR", "FIL"],
      q: null,
      sortFields: ["path"],
      asc: false,
      page: 1,
      pageSize: 2
    });
    expect(result.paging).toEqual({
      page: 1,
      pageSize: 2,
      total: 2,
      returned: 2
    });
    expect(result.baseComponent).toMatchObject({
      key: `${PROJECT_KEY}:src`,
      name: "src",
      qualifier: "DIR",
      path: "src"
    });
    expect(result.components).toEqual([
      {
        key: `${PROJECT_KEY}:src/app`,
        name: "app",
        longName: null,
        qualifier: "DIR",
        path: "src/app",
        project: null,
        description: null,
        tags: [],
        visibility: null,
        isAiCodeFixEnabled: null,
        enabled: null
      },
      {
        key: `${PROJECT_KEY}:src/index.ts`,
        name: "index.ts",
        longName: "src/index.ts",
        qualifier: "FIL",
        path: "src/index.ts",
        project: PROJECT_KEY,
        description: null,
        tags: [],
        visibility: null,
        isAiCodeFixEnabled: null,
        enabled: true
      }
    ]);
  });

  it("能独立获取规则详情", async () => {
    const service = new SonarQubeFindingService(createConfig());
    const result = await service.getRules(PROJECT_URL, ["typescript:S1874", "js:S2068"]);

    expect(result.origin).toBe(ORIGIN);
    expect(result.requestedKeys).toEqual(["typescript:S1874", "js:S2068"]);
    expect(result.rules).toEqual([
      {
        key: "typescript:S1874",
        name: "Deprecated APIs should not be used",
        lang: "ts",
        severity: "MINOR",
        type: "CODE_SMELL",
        cleanCodeAttribute: "CONVENTIONAL",
        tags: [],
        sysTags: ["cwe"],
        description: "Generic rule markdown"
      },
      {
        key: "js:S2068",
        name: "Credentials should not be hard-coded",
        lang: null,
        severity: null,
        type: null,
        cleanCodeAttribute: null,
        tags: [],
        sysTags: [],
        description: "Hotspot rule markdown"
      }
    ]);
  });
});

/**
 * 构造最小可运行配置，避免测试依赖真实环境变量。
 */
function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    sonarToken: "token",
    sonarRequestTimeoutMs: 2_000,
    sonarRetryCount: 0,
    sonarHttpProxy: null,
    sonarDefaultFindingCategories: ["security", "reliability", "security-hotspot"],
    sonarDefaultOverviewItems: [
      "security",
      "reliability",
      "maintainability",
      "accepted-issues",
      "coverage",
      "duplications",
      "security-hotspots"
    ],
    ...overrides
  };
}

/**
 * 统一 mock 所有 SonarQube API，保证 service 测试不依赖真实网络。
 */
function createFetchMock(options?: { forbidHotspotShow?: boolean }) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    );

    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toMatch(/^Basic /);

    if (url.pathname === "/api/server/version") {
      return new Response("10.8.1", {
        headers: {
          "content-type": "text/plain"
        }
      });
    }

    if (url.pathname === "/api/components/show") {
      expect(url.searchParams.get("component")).toBe(PROJECT_KEY);
      return jsonResponse({
        component: {
          key: PROJECT_KEY,
          name: PROJECT_KEY,
          qualifier: "TRK"
        }
      });
    }

    if (url.pathname === "/api/qualitygates/project_status") {
      expect(url.searchParams.get("projectKey")).toBe(PROJECT_KEY);
      return jsonResponse({
        projectStatus: {
          status: "OK",
          conditions: [
            {
              status: "OK",
              metricKey: "new_coverage",
              comparator: "LT",
              errorThreshold: "80",
              actualValue: "92.6"
            }
          ],
          ignoredConditions: false,
          period: {
            mode: "PREVIOUS_VERSION",
            date: "2026-03-18T04:03:09+0000",
            parameter: "2026.2.0"
          },
          caycStatus: "compliant"
        }
      });
    }

    if (url.pathname === "/api/measures/component") {
      expect(url.searchParams.get("component")).toBe(PROJECT_KEY);
      expect(url.searchParams.get("metricKeys")).toBeTruthy();

      return jsonResponse({
        component: {
          key: PROJECT_KEY,
          name: PROJECT_KEY,
          qualifier: "TRK",
          measures: [
            {
              metric: "coverage",
              value: "87.8",
              bestValue: false
            },
            {
              metric: "bugs",
              value: "0",
              bestValue: true
            },
            {
              metric: "alert_status",
              value: "OK"
            },
            {
              metric: "accepted_issues",
              value: "2",
              bestValue: false
            },
            {
              metric: "duplicated_lines_density",
              value: "1.2",
              bestValue: true
            },
            {
              metric: "security_hotspots",
              value: "1",
              bestValue: false
            },
            {
              metric: "software_quality_security_issues",
              value: "1",
              bestValue: false
            },
            {
              metric: "software_quality_reliability_issues",
              value: "1",
              bestValue: false
            },
            {
              metric: "software_quality_maintainability_issues",
              value: "2",
              bestValue: false
            }
          ]
        }
      });
    }

    if (url.pathname === "/api/issues/search") {
      const issueKey = url.searchParams.get("issues");
      if (issueKey === "ISSUE-SEC") {
        return jsonResponse({
          paging: {
            pageIndex: 1,
            pageSize: 500,
            total: 1
          },
          issues: [securityIssue()],
          rules: [
            {
              key: "js:S5131",
              name: "Potential XSS"
            }
          ]
        });
      }

      if (url.searchParams.get("impactSoftwareQualities") === "SECURITY") {
        expect(url.searchParams.get("resolved")).toBe("false");
        return jsonResponse({
          paging: {
            pageIndex: 1,
            pageSize: 500,
            total: 1
          },
          issues: [securityIssue()],
          rules: [
            {
              key: "js:S5131",
              name: "Potential XSS"
            }
          ]
        });
      }

      if (url.searchParams.get("impactSoftwareQualities") === "RELIABILITY") {
        expect(url.searchParams.get("resolved")).toBe("false");
        return jsonResponse({
          paging: {
            pageIndex: 1,
            pageSize: 500,
            total: 1
          },
          issues: [
            {
              key: "ISSUE-BUG",
              rule: "ts:S2259",
              severity: "MAJOR",
              type: "BUG",
              component: `${PROJECT_KEY}:src/runtime.ts`,
              line: 42,
              status: "OPEN",
              issueStatus: "OPEN",
              message: "Possible null dereference.",
              creationDate: "2026-01-03T00:00:00+0000",
              updateDate: "2026-03-03T00:00:00+0000",
              impacts: [
                {
                  softwareQuality: "RELIABILITY",
                  severity: "MEDIUM"
                }
              ]
            }
          ],
          rules: [
            {
              key: "ts:S2259",
              name: "Null pointers should not be dereferenced"
            }
          ]
        });
      }

      if (url.searchParams.get("impactSoftwareQualities") === "MAINTAINABILITY") {
        expect(url.searchParams.get("resolved")).toBeTruthy();
        if (url.searchParams.get("types") === "CODE_SMELL") {
          expect(url.searchParams.get("impactSeverities")).toBe("LOW");
        }
        return jsonResponse({
          paging: {
            pageIndex: 1,
            pageSize: url.searchParams.get("types") === "CODE_SMELL" ? 2 : 500,
            total: url.searchParams.get("types") === "CODE_SMELL" ? 2 : 1
          },
          issues:
            url.searchParams.get("types") === "CODE_SMELL"
              ? [
                  {
                    key: "ISSUE-GENERIC-1",
                    rule: "typescript:S1874",
                    severity: "MINOR",
                    type: "CODE_SMELL",
                    component: `${PROJECT_KEY}:src/legacy.ts`,
                    line: 12,
                    status: "RESOLVED",
                    issueStatus: "ACCEPTED",
                    resolution: "WONTFIX",
                    message: "Deprecated API is used.",
                    creationDate: "2026-03-19T03:50:37+0000",
                    updateDate: "2026-03-20T03:49:52+0000",
                    impacts: [
                      {
                        softwareQuality: "MAINTAINABILITY",
                        severity: "LOW"
                      }
                    ]
                  },
                  {
                    key: "ISSUE-GENERIC-2",
                    rule: "typescript:S1874",
                    severity: "MINOR",
                    type: "CODE_SMELL",
                    component: `${PROJECT_KEY}:src/legacy.ts`,
                    line: 18,
                    status: "RESOLVED",
                    issueStatus: "ACCEPTED",
                    resolution: "WONTFIX",
                    message: "Another deprecated API is used.",
                    creationDate: "2026-03-19T03:50:38+0000",
                    updateDate: "2026-03-20T03:49:53+0000",
                    impacts: [
                      {
                        softwareQuality: "MAINTAINABILITY",
                        severity: "LOW"
                      }
                    ]
                  }
                ]
              : [maintainabilityIssue()],
          rules: [
            {
              key: url.searchParams.get("types") === "CODE_SMELL" ? "typescript:S1874" : "ts:S1481",
              name:
                url.searchParams.get("types") === "CODE_SMELL"
                  ? "Deprecated APIs should not be used"
                  : "Unused local variables should be removed",
              lang: "ts",
              severity: "MINOR",
              type: "CODE_SMELL",
              cleanCodeAttribute: "CONVENTIONAL",
              sysTags: ["cwe"]
            }
          ]
        });
      }

      if (url.searchParams.get("types") === "CODE_SMELL") {
        expect(url.searchParams.get("impactSoftwareQualities")).toBe("MAINTAINABILITY");
        expect(url.searchParams.get("impactSeverities")).toBe("LOW");
        expect(url.searchParams.get("issueStatuses")).toBe("ACCEPTED");
        expect(url.searchParams.get("resolved")).toBe("true");
        expect(url.searchParams.get("ps")).toBe("2");
        expect(url.searchParams.get("p")).toBe("1");
        return jsonResponse({
          paging: {
            pageIndex: 1,
            pageSize: 2,
            total: 2
          },
          issues: [
            {
              key: "ISSUE-GENERIC-1",
              rule: "typescript:S1874",
              severity: "MINOR",
              type: "CODE_SMELL",
              component: `${PROJECT_KEY}:src/legacy.ts`,
              line: 12,
              status: "RESOLVED",
              issueStatus: "ACCEPTED",
              resolution: "WONTFIX",
              message: "Deprecated API is used.",
              creationDate: "2026-03-19T03:50:37+0000",
              updateDate: "2026-03-20T03:49:52+0000",
              impacts: [
                {
                  softwareQuality: "MAINTAINABILITY",
                  severity: "LOW"
                }
              ]
            },
            {
              key: "ISSUE-GENERIC-2",
              rule: "typescript:S1874",
              severity: "MINOR",
              type: "CODE_SMELL",
              component: `${PROJECT_KEY}:src/legacy.ts`,
              line: 18,
              status: "RESOLVED",
              issueStatus: "ACCEPTED",
              resolution: "WONTFIX",
              message: "Another deprecated API is used.",
              creationDate: "2026-03-19T03:50:38+0000",
              updateDate: "2026-03-20T03:49:53+0000",
              impacts: [
                {
                  softwareQuality: "MAINTAINABILITY",
                  severity: "LOW"
                }
              ]
            }
          ],
          rules: [
            {
              key: "typescript:S1874",
              name: "Deprecated APIs should not be used",
              lang: "ts",
              severity: "MINOR",
              type: "CODE_SMELL",
              cleanCodeAttribute: "CONVENTIONAL",
              sysTags: ["cwe"]
            }
          ]
        });
      }

    }

    if (url.pathname === "/api/issues/changelog") {
      return jsonResponse({
        changelog: [
          {
            creationDate: "2026-03-04T00:00:00+0000",
            diffs: [
              {
                key: "status",
                oldValue: "CONFIRMED",
                newValue: "OPEN"
              }
            ]
          }
        ]
      });
    }

    if (url.pathname === "/api/hotspots/search") {
      if (url.searchParams.get("status") === "REVIEWED") {
        expect(url.searchParams.get("resolution")).toBe("SAFE");
        expect(url.searchParams.get("files")).toBe(`${PROJECT_KEY}:src/config.ts`);
        expect(url.searchParams.get("hotspots")).toBe("HOT-REVIEWED-1");
        expect(url.searchParams.get("onlyMine")).toBe("false");
        expect(url.searchParams.get("inNewCodePeriod")).toBe("true");
        expect(url.searchParams.get("ps")).toBe("2");
        expect(url.searchParams.get("p")).toBe("1");

        return jsonResponse({
          paging: {
            pageIndex: 1,
            pageSize: 2,
            total: 1
          },
          hotspots: [
            {
              key: "HOT-REVIEWED-1",
              ruleKey: "js:S2068",
              component: `${PROJECT_KEY}:src/config.ts`,
              project: PROJECT_KEY,
              securityCategory: "auth",
              line: 8,
              message: "Review this potentially hard-coded password.",
              status: "REVIEWED",
              resolution: "SAFE",
              author: "alice@example.com",
              creationDate: "2026-01-05T00:00:00+0000",
              updateDate: "2026-03-05T00:00:00+0000",
              vulnerabilityProbability: "HIGH",
              textRange: {
                startLine: 8,
                endLine: 8,
                startOffset: 2,
                endOffset: 14
              },
              flows: [],
              messageFormattings: []
            }
          ],
          components: [
            {
              key: `${PROJECT_KEY}:src/config.ts`,
              qualifier: "FIL",
              name: "config.ts",
              longName: "src/config.ts",
              path: "src/config.ts"
            }
          ]
        });
      }

      return jsonResponse({
        paging: {
          pageIndex: 1,
          pageSize: 500,
          total: 1
        },
        hotspots: [
          {
            key: "HOT-1",
            ruleKey: "js:S2068",
            component: `${PROJECT_KEY}:src/config.ts`,
            line: 8,
            message: "Hard coded credential.",
            status: "TO_REVIEW",
            author: "alice@example.com",
            creationDate: "2026-01-05T00:00:00+0000",
            updateDate: "2026-03-05T00:00:00+0000",
            vulnerabilityProbability: "HIGH"
          }
        ]
      });
    }

    if (url.pathname === "/api/hotspots/show") {
      if (options?.forbidHotspotShow) {
        throw new Error("standard 模式不应该请求 /api/hotspots/show");
      }

      const hotspotKey = url.searchParams.get("hotspot");
      if (hotspotKey === "HOT-REVIEWED-1") {
        return jsonResponse({
          key: "HOT-REVIEWED-1",
          line: 8,
          message: "Review this potentially hard-coded password.",
          status: "REVIEWED",
          resolution: "SAFE",
          author: "alice@example.com",
          assignee: "reviewer",
          creationDate: "2026-01-05T00:00:00+0000",
          updateDate: "2026-03-05T00:00:00+0000",
          textRange: {
            startLine: 8,
            endLine: 8,
            startOffset: 2,
            endOffset: 14
          },
          flows: [],
          comment: [
            {
              markdown: "Looks safe"
            }
          ],
          changelog: [],
          component: {
            key: `${PROJECT_KEY}:src/config.ts`,
            name: "config.ts",
            longName: "src/config.ts",
            path: "src/config.ts",
            qualifier: "FIL"
          },
          project: {
            key: PROJECT_KEY,
            name: PROJECT_KEY,
            qualifier: "TRK"
          },
          rule: {
            key: "js:S2068",
            name: "Credentials should not be hard-coded",
            riskDescription: "Hotspot risk",
            fixRecommendations: "Hotspot fix",
            vulnerabilityDescription: "Hotspot vulnerability"
          }
        });
      }

      expect(hotspotKey).toBe("HOT-1");
      return jsonResponse({
        key: "HOT-1",
        line: 8,
        message: "Hard coded credential.",
        status: "TO_REVIEW",
        author: "alice@example.com",
        assignee: "reviewer",
        creationDate: "2026-01-05T00:00:00+0000",
        updateDate: "2026-03-05T00:00:00+0000",
        textRange: {
          startLine: 8,
          endLine: 8,
          startOffset: 2,
          endOffset: 14
        },
        flows: [],
        comment: [
          {
            markdown: "Please review"
          }
        ],
        changelog: [],
        component: {
          key: `${PROJECT_KEY}:src/config.ts`,
          name: "config.ts",
          longName: "src/config.ts",
          path: "src/config.ts",
          qualifier: "FIL"
        },
        project: {
          key: PROJECT_KEY,
          name: PROJECT_KEY,
          qualifier: "TRK"
        },
        rule: {
          key: "js:S2068",
          name: "Credentials should not be hard-coded",
          riskDescription: "Hotspot risk",
          fixRecommendations: "Hotspot fix"
        }
      });
    }

    if (url.pathname === "/api/components/tree") {
      expect(url.searchParams.get("component")).toBe(`${PROJECT_KEY}:src`);
      expect(url.searchParams.get("strategy")).toBe("children");
      expect(url.searchParams.get("qualifiers")).toBe("DIR,FIL");
      expect(url.searchParams.get("s")).toBe("path");
      expect(url.searchParams.get("asc")).toBe("false");
      expect(url.searchParams.get("ps")).toBe("2");
      expect(url.searchParams.get("p")).toBe("1");

      return jsonResponse({
        paging: {
          pageIndex: 1,
          pageSize: 2,
          total: 2
        },
        baseComponent: {
          key: `${PROJECT_KEY}:src`,
          name: "src",
          qualifier: "DIR",
          path: "src"
        },
        components: [
          {
            key: `${PROJECT_KEY}:src/app`,
            name: "app",
            qualifier: "DIR",
            path: "src/app"
          },
          {
            key: `${PROJECT_KEY}:src/index.ts`,
            name: "index.ts",
            longName: "src/index.ts",
            qualifier: "FIL",
            path: "src/index.ts",
            project: PROJECT_KEY,
            enabled: true
          }
        ]
      });
    }

    if (url.pathname === "/api/rules/show") {
      const ruleKey = url.searchParams.get("key");
      if (ruleKey === "js:S5131") {
        return jsonResponse({
          rule: {
            key: "js:S5131",
            name: "Potential XSS",
            mdDesc: "Security rule markdown"
          }
        });
      }

      if (ruleKey === "ts:S2259") {
        return jsonResponse({
          rule: {
            key: "ts:S2259",
            name: "Null pointers should not be dereferenced",
            mdDesc: "Reliability rule markdown"
          }
        });
      }

      if (ruleKey === "ts:S1481") {
        return jsonResponse({
          rule: {
            key: "ts:S1481",
            name: "Unused local variables should be removed",
            mdDesc: "Maintainability rule markdown"
          }
        });
      }

      if (ruleKey === "js:S2068") {
        return jsonResponse({
          rule: {
            key: "js:S2068",
            name: "Credentials should not be hard-coded",
            mdDesc: "Hotspot rule markdown"
          }
        });
      }

      if (ruleKey === "typescript:S1874") {
        return jsonResponse({
          rule: {
            key: "typescript:S1874",
            name: "Deprecated APIs should not be used",
            lang: "ts",
            severity: "MINOR",
            type: "CODE_SMELL",
            cleanCodeAttribute: "CONVENTIONAL",
            sysTags: ["cwe"],
            mdDesc: "Generic rule markdown"
          }
        });
      }
    }

    throw new Error(`Unhandled request: ${url}`);
  });
}

/**
 * Security issue 的基础样本，用于多个测试场景复用。
 */
function securityIssue() {
  return {
    key: "ISSUE-SEC",
    rule: "js:S5131",
    severity: "CRITICAL",
    type: "VULNERABILITY",
    component: `${PROJECT_KEY}:src/security.ts`,
    project: PROJECT_KEY,
    line: 10,
    status: "OPEN",
    issueStatus: "OPEN",
    message: "Unsanitized user input reaches the DOM.",
    creationDate: "2026-01-01T00:00:00+0000",
    updateDate: "2026-03-01T00:00:00+0000",
    impacts: [
      {
        softwareQuality: "SECURITY",
        severity: "HIGH"
      }
    ],
    comments: [
      {
        markdown: "Investigate sink"
      }
    ],
    flows: []
  };
}

/**
 * Maintainability issue 的基础样本，用于质量维度分桶测试。
 */
function maintainabilityIssue() {
  return {
    key: "ISSUE-MAINT",
    rule: "ts:S1481",
    severity: "MINOR",
    type: "CODE_SMELL",
    component: `${PROJECT_KEY}:src/cleanup.ts`,
    project: PROJECT_KEY,
    line: 7,
    status: "OPEN",
    issueStatus: "OPEN",
    message: "Remove this unused local variable.",
    creationDate: "2026-02-01T00:00:00+0000",
    updateDate: "2026-03-10T00:00:00+0000",
    impacts: [
      {
        softwareQuality: "MAINTAINABILITY",
        severity: "LOW"
      }
    ],
    comments: [],
    flows: []
  };
}

/**
 * 生成 JSON Response，减少重复样板代码。
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

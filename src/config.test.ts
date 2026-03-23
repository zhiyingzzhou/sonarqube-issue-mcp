import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

/**
 * 配置测试负责保障环境变量解析与默认值稳定。
 */
describe("loadConfig", () => {
  it("缺少 SONAR_TOKEN 时会报错", () => {
    expect(() => loadConfig({})).toThrow(/SONAR_TOKEN/);
  });

  it("会填充默认值", () => {
    const config = loadConfig({
      SONAR_TOKEN: "test-token"
    });

    expect(config.sonarToken).toBe("test-token");
    expect(config.sonarRequestTimeoutMs).toBe(20_000);
    expect(config.sonarRetryCount).toBe(2);
    expect(config.sonarHttpProxy).toBeNull();
    expect(config.sonarDefaultFindingCategories).toEqual([
      "security",
      "reliability",
      "security-hotspot"
    ]);
    expect(config.sonarDefaultOverviewItems).toEqual([
      "security",
      "reliability",
      "maintainability",
      "accepted-issues",
      "coverage",
      "duplications",
      "security-hotspots"
    ]);
  });

  it("会解析 SonarQube 代理配置", () => {
    const config = loadConfig({
      SONAR_TOKEN: "test-token",
      SONAR_HTTP_PROXY: "http://127.0.0.1:7890"
    });

    expect(config.sonarHttpProxy).toBe("http://127.0.0.1:7890/");
  });

  it("会解析 findings 分类和 overview 项默认值覆盖", () => {
    const config = loadConfig({
      SONAR_TOKEN: "test-token",
      SONAR_DEFAULT_FINDING_CATEGORIES: "maintainability,security-hotspot",
      SONAR_DEFAULT_OVERVIEW_ITEMS: "coverage,security-hotspots"
    });

    expect(config.sonarDefaultFindingCategories).toEqual([
      "maintainability",
      "security-hotspot"
    ]);
    expect(config.sonarDefaultOverviewItems).toEqual([
      "coverage",
      "security-hotspots"
    ]);
  });

  it("会拒绝非法的 findings 分类配置", () => {
    expect(() =>
      loadConfig({
        SONAR_TOKEN: "test-token",
        SONAR_DEFAULT_FINDING_CATEGORIES: "security,hotspots"
      })
    ).toThrow(/SONAR_DEFAULT_FINDING_CATEGORIES/);
  });
});

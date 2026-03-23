import { describe, expect, it } from "vitest";

import {
  buildHotspotBrowseUrl,
  buildIssueBrowseUrl,
  parseProjectUrl
} from "./project-ref.js";

/**
 * 这些测试用于锁定 URL 解析与深链构造规则。
 */
describe("parseProjectUrl", () => {
  it("能从 dashboard URL 中解析项目上下文", () => {
    const parsed = parseProjectUrl(
      "https://sonarqube.example.com/dashboard?id=example-project"
    );

    expect(parsed).toEqual({
      origin: "https://sonarqube.example.com",
      projectKey: "example-project",
      branch: null,
      pullRequest: null
    });
  });

  it("能从页面 URL 中提取 branch 和 pullRequest", () => {
    const parsed = parseProjectUrl(
      "https://sonarqube.example.com/project/issues?id=example-project&branch=feat%2Fabc&pullRequest=123"
    );

    expect(parsed.branch).toBe("feat/abc");
    expect(parsed.pullRequest).toBe("123");
  });

  it("会拒绝缺少 id 的 URL", () => {
    expect(() =>
      parseProjectUrl("https://sonarqube.example.com/dashboard")
    ).toThrow(/id/);
  });

  it("能构造 issue 和 hotspot 深链", () => {
    const projectRef = parseProjectUrl(
      "https://sonarqube.example.com/dashboard?id=example-project&branch=main"
    );

    expect(buildIssueBrowseUrl(projectRef, "ISSUE-1")).toBe(
      "https://sonarqube.example.com/project/issues?id=example-project&open=ISSUE-1&branch=main"
    );
    expect(buildHotspotBrowseUrl(projectRef, "HOT-1")).toBe(
      "https://sonarqube.example.com/security_hotspots?id=example-project&hotspots=HOT-1&branch=main"
    );
  });
});

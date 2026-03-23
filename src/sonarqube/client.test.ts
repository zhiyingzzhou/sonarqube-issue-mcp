import { afterEach, describe, expect, it, vi } from "vitest";

import { SonarQubeMcpError } from "../errors.js";
import { parseProjectUrl } from "../project-ref.js";
import { SonarQubeClient } from "./client.js";

/**
 * client 层测试主要关注错误映射与底层请求参数传递。
 */
describe("SonarQubeClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("会把 503 响应映射成 INDEXING 错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>503</html>", { status: 503 }))
    );

    const client = new SonarQubeClient(
      parseProjectUrl("https://sonarqube.example.com/dashboard?id=example-project"),
      {
        token: "token",
        requestTimeoutMs: 1_000,
        retryCount: 0,
        httpProxy: null
      }
    );

    await expect(client.getServerVersion()).rejects.toBeInstanceOf(SonarQubeMcpError);
    await expect(client.getServerVersion()).rejects.toMatchObject({
      code: "INDEXING"
    });
  });

  it("配置代理时会通过 dispatcher 发请求", async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response("10.8.1", {
          headers: {
            "content-type": "text/plain"
          }
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SonarQubeClient(
      parseProjectUrl("https://sonarqube.example.com/dashboard?id=example-project"),
      {
        token: "token",
        requestTimeoutMs: 1_000,
        retryCount: 0,
        httpProxy: "http://127.0.0.1:7890"
      }
    );

    await expect(client.getServerVersion()).resolves.toBe("10.8.1");

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();

    const requestInit = firstCall?.[1] as (RequestInit & { dispatcher?: unknown }) | undefined;
    expect(requestInit?.dispatcher).toBeTruthy();
  });

  it("会透传 impactSoftwareQualities 到 issues/search", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      );

      expect(url.pathname).toBe("/api/issues/search");
      expect(url.searchParams.get("impactSoftwareQualities")).toBe("SECURITY");
      expect(url.searchParams.get("resolved")).toBe("false");

      return new Response(
        JSON.stringify({
          paging: {
            pageIndex: 1,
            pageSize: 10,
            total: 0
          },
          issues: [],
          rules: []
        }),
        {
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SonarQubeClient(
      parseProjectUrl("https://sonarqube.example.com/dashboard?id=example-project"),
      {
        token: "token",
        requestTimeoutMs: 1_000,
        retryCount: 0,
        httpProxy: null
      }
    );

    await client.searchIssues({
      types: [],
      impactSoftwareQualities: ["SECURITY"],
      issueStatuses: [],
      impactSeverities: [],
      resolved: false,
      page: 1,
      pageSize: 10
    });
  });
});

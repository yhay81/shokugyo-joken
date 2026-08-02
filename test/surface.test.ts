import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { app } from "../src/worker";

function bindings() {
  const run = vi.fn(async () => ({ success: true }));
  const first = vi.fn(async () => ({ ok: 1 }));
  const bind = vi.fn(() => ({ run }));
  const prepare = vi.fn(() => ({ bind, first, run }));
  return {
    ASSETS: { fetch: vi.fn() } as unknown as Fetcher,
    DB: { prepare } as unknown as D1Database,
  };
}

describe("product surface", () => {
  it("publishes four focused Japanese pages", async () => {
    const env = bindings();
    for (const path of ["/", "/guide", "/source", "/privacy"]) {
      const response = await app.request(
        `https://shokugyo-joken.yhay81.com${path}`,
        undefined,
        env,
      );
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain('<html lang="ja">');
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    }
  });

  it("communicates the product visually without oversized or internal language", async () => {
    const response = await app.request("https://shokugyo-joken.yhay81.com/", undefined, bindings());
    const html = await response.text();
    const surface = html + readFileSync(resolve(process.cwd(), "public/styles.css"), "utf8");
    expect(html).toContain("condition-desk");
    expect(html).toContain("condition-stamps");
    expect(html).toContain("賞与と通勤手当");
    expect(html).toContain("新規求人数の割合");
    expect(surface).not.toMatch(/市場スコア|移行候補|収益性|成功条件|public validation/iu);
    expect(surface).not.toMatch(/gradient/iu);
    expect(surface).not.toMatch(/font-size:\s*(?:[5-9]\d|\d{3,})px/iu);
    expect(surface).not.toMatch(/better-auth|betterAuth/iu);
  });

  it("accepts only same-origin allowlisted anonymous events", async () => {
    const env = bindings();
    const accepted = await app.request(
      "https://shokugyo-joken.yhay81.com/api/telemetry",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://shokugyo-joken.yhay81.com",
          "x-shokugyo-joken-session": "12345678-1234-4123-8123-123456789abc",
          "x-shokugyo-joken-qa": "1",
        },
        body: JSON.stringify({ name: "occupation_added" }),
      },
      env,
    );
    const invalid = await app.request(
      "https://shokugyo-joken.yhay81.com/api/telemetry",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://shokugyo-joken.yhay81.com",
          "x-shokugyo-joken-session": "12345678-1234-4123-8123-123456789abc",
        },
        body: JSON.stringify({ name: "unknown" }),
      },
      env,
    );
    const foreign = await app.request(
      "https://shokugyo-joken.yhay81.com/api/telemetry",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.com",
          "x-shokugyo-joken-session": "12345678-1234-4123-8123-123456789abc",
        },
        body: JSON.stringify({ name: "visited" }),
      },
      env,
    );
    expect(accepted.status).toBe(202);
    expect(invalid.status).toBe(400);
    expect(foreign.status).toBe(403);
  });

  it("separates automated QA and honors browser privacy controls", () => {
    const client = readFileSync(resolve(process.cwd(), "public/app.js"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0001_telemetry.sql"), "utf8");
    expect(client).toContain("navigator.webdriver");
    expect(client).toContain("navigator.doNotTrack");
    expect(client).toContain("globalPrivacyControl");
    expect(client).toContain('"x-shokugyo-joken-qa"');
    expect(migration).toContain("is_qa");
    expect(migration).toContain("occupation_added");
  });

  it("publishes exactly four canonical sitemap URLs", async () => {
    const response = await app.request(
      "https://shokugyo-joken.yhay81.com/sitemap.xml",
      undefined,
      bindings(),
    );
    const xml = await response.text();
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
    expect(response.status).toBe(200);
    expect(locations).toHaveLength(4);
    expect(new Set(locations).size).toBe(4);
    expect(locations).toContain("https://shokugyo-joken.yhay81.com/source");
  });

  it("returns a product 404 for unknown paths", async () => {
    const response = await app.request(
      "https://shokugyo-joken.yhay81.com/missing",
      undefined,
      bindings(),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("この求人票は見つかりません");
  });
});

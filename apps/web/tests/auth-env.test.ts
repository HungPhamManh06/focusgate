import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSupabasePublicEnv, sanitizeNextPath } from "../lib/env.ts";
import { deviceRegisterSchema, deviceRenameSchema } from "../lib/validation.ts";

describe("parseSupabasePublicEnv", () => {
  it("rejects missing, placeholder, or invalid URLs", () => {
    assert.equal(parseSupabasePublicEnv({}), null);
    assert.equal(
      parseSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://your-project-ref.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
      }),
      null,
    );
    assert.equal(
      parseSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "real-anon-key",
      }),
      null,
    );
    assert.equal(
      parseSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "ftp://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "real-anon-key",
      }),
      null,
    );
  });

  it("accepts valid HTTP/HTTPS Supabase URL and anon key", () => {
    assert.deepEqual(
      parseSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      }),
      {
        url: "http://127.0.0.1:54321",
        anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      },
    );
  });
});

describe("sanitizeNextPath", () => {
  it("prevents open redirects and keeps valid relative app paths", () => {
    assert.equal(sanitizeNextPath(null), "/");
    assert.equal(sanitizeNextPath(""), "/");
    assert.equal(sanitizeNextPath("//evil.com"), "/");
    assert.equal(sanitizeNextPath("https://evil.com/phish"), "/");
    assert.equal(sanitizeNextPath("/\\evil.com"), "/");
    assert.equal(sanitizeNextPath("/focus?taskId=123"), "/focus?taskId=123");
    assert.equal(sanitizeNextPath("/planner"), "/planner");
  });
});

describe("device validation schemas", () => {
  it("validates device registration names and platforms", () => {
    assert.equal(deviceRegisterSchema.safeParse({ name: "  ", platform: "windows" }).success, false);
    assert.equal(deviceRegisterSchema.safeParse({ name: "Work PC", platform: "ios" }).success, false);
    const ok = deviceRegisterSchema.safeParse({ name: "  Work PC  ", platform: "windows" });
    assert.equal(ok.success, true);
    if (ok.success) {
      assert.equal(ok.data.name, "Work PC");
      assert.equal(ok.data.platform, "windows");
    }
  });

  it("validates device rename length bounds", () => {
    assert.equal(deviceRenameSchema.safeParse({ name: "" }).success, false);
    assert.equal(deviceRenameSchema.safeParse({ name: "x".repeat(81) }).success, false);
    assert.equal(deviceRenameSchema.safeParse({ name: "Redmi Note 13" }).success, true);
  });
});

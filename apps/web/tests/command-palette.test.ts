import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCommandRoutes,
  parseQuickTaskQuery,
} from "../lib/domain/command-palette.ts";

describe("command palette helpers", () => {
  it("parses quick task prefixes (+, !, *) and plain titles", () => {
    assert.deepEqual(parseQuickTaskQuery("+ Đọc sách 20p"), {
      title: "Đọc sách 20p",
      kind: "must_do",
    });
    assert.deepEqual(parseQuickTaskQuery("* Chạy bộ 5km"), {
      title: "Chạy bộ 5km",
      kind: "bonus",
    });
    assert.equal(parseQuickTaskQuery("   +   "), null);
    assert.equal(parseQuickTaskQuery(""), null);
  });

  it("filters routes by EN/VI labels and keywords, and hides routes on + quick-add", () => {
    const focusMatches = filterCommandRoutes("studio");
    assert.equal(focusMatches.length, 1);
    assert.equal(focusMatches[0]?.href, "/focus");

    const viMatches = filterCommandRoutes("hộ chiếu");
    assert.equal(viMatches[0]?.href, "/statistics");

    assert.deepEqual(filterCommandRoutes("+ Quick task"), []);
  });
});

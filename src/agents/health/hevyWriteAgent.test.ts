import { describe, expect, it } from "vitest";

import { narrowHevyTemplateCatalog } from "./hevyWriteAgent.js";

describe("narrowHevyTemplateCatalog", () => {
  it("ranks templates that match words in the plan higher", () => {
    const catalog = [
      { id: "1", title: "Face Pull" },
      { id: "2", title: "Bench Press (Barbell)" },
      { id: "3", title: "Leg Extension" },
    ];
    const out = narrowHevyTemplateCatalog("bench press day", catalog, 10);
    expect(out[0]?.title).toContain("Bench");
  });
});

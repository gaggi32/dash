import { describe, expect, it } from "vitest";
import { formatSize, parseAttachments } from "./attachments";

describe("parseAttachments", () => {
  it("reads the stored JSON list", () => {
    expect(parseAttachments('[{"id":"1-0","name":"a.pdf","size":12}]')).toEqual([
      { id: "1-0", name: "a.pdf", size: 12 },
    ]);
  });

  it("treats empty, malformed and non-list values as none", () => {
    expect(parseAttachments(null)).toEqual([]);
    expect(parseAttachments(undefined)).toEqual([]);
    expect(parseAttachments("")).toEqual([]);
    expect(parseAttachments("{not json")).toEqual([]);
    expect(parseAttachments('{"id":"1"}')).toEqual([]);
  });

  it("drops entries without an id or name and repairs the size", () => {
    const raw = JSON.stringify([
      { id: "1-0", name: "ok.txt", size: "7" },
      { id: 5, name: "bad id" },
      { id: "2-0" },
      null,
      { id: "3-0", name: "no size" },
    ]);
    expect(parseAttachments(raw)).toEqual([
      { id: "1-0", name: "ok.txt", size: 7 },
      { id: "3-0", name: "no size", size: 0 },
    ]);
  });
});

describe("formatSize", () => {
  it("picks a readable unit", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1023)).toBe("1023 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatSize(100 * 1024 * 1024)).toBe("100 MB");
    expect(formatSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });
});

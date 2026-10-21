import { describe, expect, it } from "vitest";
import { saveRefusal } from "./server.js";

const PORT = 4321;
const fromPage = { method: "POST", origin: `http://127.0.0.1:${PORT}`, contentType: "application/json" };

describe("saveRefusal", () => {
  it("accepts a JSON POST from the page's own origin, however the page was opened", () => {
    expect(saveRefusal(fromPage, PORT)).toBeUndefined();
    expect(saveRefusal({ ...fromPage, origin: `http://localhost:${PORT}` }, PORT)).toBeUndefined();
    expect(saveRefusal({ ...fromPage, contentType: "application/json; charset=utf-8" }, PORT)).toBeUndefined();
  });

  it("refuses another origin, a missing origin and the right host on another port", () => {
    for (const origin of ["https://example.com", undefined, "null", `http://127.0.0.1:${PORT + 1}`, `https://127.0.0.1:${PORT}`]) {
      expect(saveRefusal({ ...fromPage, origin }, PORT)).toBe("Only the tracker's own page can save rules.");
    }
  });

  it("refuses a body that isn't JSON, such as a form a web page could post", () => {
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded", undefined]) {
      expect(saveRefusal({ ...fromPage, contentType }, PORT)).toBe("Rules are saved as JSON.");
    }
  });

  it("refuses anything but a POST", () => {
    expect(saveRefusal({ ...fromPage, method: "GET" }, PORT)).toBe("Rules are saved with a POST.");
  });
});

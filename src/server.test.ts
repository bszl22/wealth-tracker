import { describe, expect, it } from "vitest";
import { postRefusal } from "./server.js";

const PORT = 4321;
const fromPage = { method: "POST", origin: `http://127.0.0.1:${PORT}`, contentType: "application/json" };

// The same check guards saving a rule and asking Claude for Suggested Rules.
describe("postRefusal", () => {
  it("accepts a JSON POST from the page's own origin, however the page was opened", () => {
    expect(postRefusal(fromPage, PORT)).toBeUndefined();
    expect(postRefusal({ ...fromPage, origin: `http://localhost:${PORT}` }, PORT)).toBeUndefined();
    expect(postRefusal({ ...fromPage, contentType: "application/json; charset=utf-8" }, PORT)).toBeUndefined();
  });

  it("refuses another origin, a missing origin and the right host on another port", () => {
    for (const origin of ["https://example.com", undefined, "null", `http://127.0.0.1:${PORT + 1}`, `https://127.0.0.1:${PORT}`]) {
      expect(postRefusal({ ...fromPage, origin }, PORT)).toBe("Only the tracker's own page can save rules or ask for Suggested Rules.");
    }
  });

  it("refuses a body that isn't JSON, such as a form a web page could post", () => {
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded", undefined]) {
      expect(postRefusal({ ...fromPage, contentType }, PORT)).toBe("The tracker only accepts JSON here.");
    }
  });

  it("refuses anything but a POST", () => {
    expect(postRefusal({ ...fromPage, method: "GET" }, PORT)).toBe("The tracker only accepts a POST here.");
  });
});

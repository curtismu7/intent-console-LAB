import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

// Real-mode contract: the mode toggle POSTs /api/mode and then reloads every data endpoint
// (not just /api/info), the Real option is disabled with the realHint tooltip while
// !realAvailable, and a real resolve renders the gateway's answer honestly (decidedBy,
// quoted detail, labelled projection panel, observed hops) without leaking bearer or URL.
const info = (over = {}) => ({ mode: "mock", source: "mock", simulated: true, realAvailable: true, realHint: null, title: "AI Intents Console Lab", version: "0.1.0", ...over });
const realResult = {
  source: "real", decision: "deny", matched: "large-transfer", reason: "gateway policy", reasonCode: "POLICY_DENY",
  decidedBy: "tenant AI Gateway", detail: "Refused by policy transfer-limit: amounts over 1000 require step-up.",
  scores: [{ name: "large-transfer", score: 0.91, floor: 0.5 }],
  localProjection: { decision: "allow", matched: "transfer-funds", scores: [{ name: "transfer-funds", score: 0.42, floor: 0.5 }] },
  hops: [
    { n: 1, from: "browser", to: "lab", label: "lab resolve", decision: "allow", source: "real" },
    { n: 2, from: "lab", to: "ai-gateway", label: "gateway decision", decision: "deny", source: "real" },
  ],
};
const mockResult = {
  decision: "allow", matched: "transfer-funds", reason: "over floor",
  scores: [{ name: "transfer-funds", score: 0.8, floor: 0.5 }],
  hops: [{ n: 1, from: "browser", to: "lab", label: "lab resolve", decision: "allow" }],
};
const config = { Disabled: false, IntentIDs: [], Encoder: { URL: "http://127.0.0.1:7825/encoder", TimeoutMS: 2000, FailClosed: true } };

function stubFetch({ infoBody = info(), modeStatus = 200, resolveBody = mockResult } = {}) {
  const calls = { mode: 0, info: 0, intents: 0, appConfig: 0 };
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url === "/api/info") { calls.info += 1; return json(infoBody); }
    if (url === "/api/scenarios") return json({ title: "AI Intents Console Lab", intro: "i", banner: "b", realBanner: "Real decisions come from the live AI Gateway.", products: [], facts: [], scenarios: [], talkTrack: [] });
    if (url === "/api/intents") { calls.intents += 1; return json({ intents: [] }); }
    if (url === "/api/app-config") { calls.appConfig += 1; return json({ config }); }
    if (url === "/api/mode") {
      calls.mode += 1;
      if (modeStatus !== 200) return json({ error: "real_not_configured", detail: "set the gateway settings and restart" }, modeStatus);
      return json({ source: JSON.parse(opts.body).source });
    }
    if (url === "/api/resolve") return json(resolveBody);
    return json({}, 404);
  });
  return calls;
}

beforeEach(() => { window.location.hash = ""; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Story landing tab (UI-RELAYOUT-PATTERN)", () => {
  it("renders numbered sections in narrative order with the pattern classes", async () => {
    stubFetch();
    render(<App />);
    await screen.findByTestId("banner");
    const story = screen.getByTestId("tab-story");
    expect(story).toHaveClass("story");
    const nums = [...story.querySelectorAll(".step-num")].map((el) => el.textContent);
    expect(nums).toEqual(["1", "2", "3"]);
    const headings = [...story.querySelectorAll(":scope > .panel > h2")].map((h) => h.textContent);
    expect(headings[0]).toContain("Define intents");
    expect(headings[1]).toContain("Resolve one action");
    expect(headings[2]).toContain("The encoder");
    // aria-hidden digits keep the accessible heading text clean
    expect(screen.getByRole("heading", { name: "Resolve one action" })).toBeInTheDocument();
  });

  it("the Facts tab pairs Facts and Scenarios in a .duo", async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<App />);
    await screen.findByTestId("banner");
    await user.click(screen.getByRole("link", { name: "Facts & Talk" }));
    expect(screen.getByTestId("tab-facts").querySelector(".duo")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Facts — what is measured, what is not" })).toBeInTheDocument();
  });
});

describe("mode switch reloads all data (rule 19)", () => {
  it("POST /api/mode, then reloads /api/info, /api/intents and /api/app-config", async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    render(<App />);
    await screen.findByTestId("banner");
    const before = { mode: calls.mode, info: calls.info, intents: calls.intents, cfg: calls.appConfig };
    await user.selectOptions(screen.getByTestId("mode-select"), "real");
    await waitFor(() => expect(calls.mode).toBe(before.mode + 1));
    await waitFor(() => expect(calls.info).toBeGreaterThan(before.info));
    await waitFor(() => expect(calls.intents).toBeGreaterThan(before.intents));
    await waitFor(() => expect(calls.appConfig).toBeGreaterThan(before.cfg));
    expect(globalThis.fetch.mock.calls.filter(([u, o]) => u === "/api/mode" && o?.body?.includes("real"))).toHaveLength(1);
  });

  it("a 409 (real_not_configured) is shown as data, not an exception", async () => {
    const user = userEvent.setup();
    stubFetch({ modeStatus: 409 });
    render(<App />);
    await screen.findByTestId("banner");
    await user.selectOptions(screen.getByTestId("mode-select"), "real");
    expect(await screen.findByTestId("app-error")).toHaveTextContent(/real_not_configured|set the gateway settings/i);
  });
});

describe("Real disabled with how-to tooltip", () => {
  it("the Real option is disabled and carries the realHint while realAvailable is false", async () => {
    stubFetch({ infoBody: info({ realAvailable: false, realHint: "Set AI_GATEWAY_URL and its bearer in the lab's .env and restart the lab." }) });
    render(<App />);
    const opt = await screen.findByTestId("mode-real");
    expect(opt).toBeDisabled();
    expect(opt).toHaveAttribute("title", "Set AI_GATEWAY_URL and its bearer in the lab's .env and restart the lab.");
  });

  it("the Real option is enabled when realAvailable is true", async () => {
    stubFetch({ infoBody: info({ realAvailable: true }) });
    render(<App />);
    expect(await screen.findByTestId("mode-real")).toBeEnabled();
  });
});

describe("real-mode resolve result", () => {
  async function runResolve(over = {}) {
    const user = userEvent.setup();
    stubFetch({ resolveBody: { ...realResult, ...over } });
    render(<App />);
    await screen.findByTestId("banner");
    await user.click(screen.getByTestId("resolve-run"));
    await screen.findByTestId("resolve-result");
  }

  it("shows the mock|real chip, decidedBy and the mono reasonCode", async () => {
    await runResolve();
    expect(screen.getByTestId("resolve-source")).toHaveTextContent("real");
    expect(screen.getByTestId("resolve-decided-by")).toHaveTextContent("tenant AI Gateway");
    expect(screen.getByTestId("resolve-reason-code")).toHaveTextContent("POLICY_DENY");
  });

  it("shows the gateway detail as a quoted block", async () => {
    await runResolve();
    const detail = screen.getByTestId("resolve-detail");
    expect(detail).toHaveTextContent("Refused by policy transfer-limit");
  });

  it("renders the projection in a separately labelled panel, distinct from the decision", async () => {
    await runResolve();
    const panel = screen.getByTestId("resolve-projection");
    expect(panel).toHaveTextContent(/projection, not the decision/);
    expect(screen.getByTestId("resolve-projection-decision")).toHaveTextContent("ALLOW");
    expect(screen.getByTestId("resolve-projection-scores")).toHaveTextContent("transfer-funds");
    expect(screen.getByTestId("resolve-decision")).toHaveTextContent("DENY");
  });

  it("real hops render as observed and do not reuse the mock checked chip styling", async () => {
    await runResolve();
    expect(screen.getByTestId("hop-decision-2")).toHaveTextContent(/deny \(observed\)/);
    expect(screen.getByTestId("hop-decision-2").className).toContain("chip-observed");
    expect(screen.getByTestId("hop-decision-2").className).not.toContain("chip-ok");
  });

  it("mock hops keep the existing checked styling", async () => {
    await runResolve({ source: undefined, decidedBy: undefined, reasonCode: undefined, detail: undefined, localProjection: undefined, hops: mockResult.hops });
    expect(screen.getByTestId("resolve-source")).toHaveTextContent("mock");
    expect(screen.getByTestId("hop-decision-1").className).toContain("chip-ok");
    expect(screen.queryByTestId("resolve-projection")).toBeNull();
    expect(screen.queryByTestId("resolve-detail")).toBeNull();
  });

  it("the stubbed payloads carry no bearer or gateway URL and the rendered DOM does not leak any", async () => {
    await runResolve();
    const payload = JSON.stringify(realResult);
    expect(payload).not.toMatch(/bearer|sk-|https?:\/\//i);
    expect(document.body.innerHTML).not.toMatch(/sk-secret|gw\.tenant|authorization/i);
  });
});

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { accountInitial } from "../lib/utils.js";

// Identity chip (Profile spec P0-1, board picks 1B + 2B).

let mockAccount;
vi.mock("../hooks/useAccount.js", () => ({ useAccount: () => mockAccount }));

import ProfileChip from "./ProfileChip.jsx";

const base = { configured: true, email: null, syncing: false, lastSync: 0, lastError: "", pendingLink: false };
const render = (account, props = {}) => {
  mockAccount = { ...base, ...account };
  return renderToStaticMarkup(<ProfileChip onOpen={() => {}} {...props} />);
};

describe("ProfileChip", () => {
  it("renders nothing on builds without accounts", () => {
    expect(render({ configured: false })).toBe("");
  });

  it("signed out: shows the Sign in verb, never an icon alone", () => {
    const html = render({});
    expect(html).toContain(">Sign in<");
    expect(html).toContain('aria-label="Sign in"');
    expect(html).not.toContain('class="wchip-ember"'); // no live ember until someone is home
  });

  it("signed in: shows the initial inside the ember ring", () => {
    const html = render({ email: "kraig@example.com" });
    expect(html).toContain(">K<");
    expect(html).toContain('aria-label="Your account"');
    expect(html).toContain('class="wchip-orbit"');
    expect(html).toContain('class="wchip-ember"');
    expect(html).not.toContain("Sign in");
  });

  it("parks the ember when motion is off (harness)", () => {
    expect(render({ email: "k@example.com" }, { noMotion: true })).toContain("wchip-orbit wchip-still");
  });

  it("guards the orbit behind prefers-reduced-motion", () => {
    expect(render({ email: "k@example.com" })).toContain("prefers-reduced-motion");
  });

  it("is a 44px touch target in both states", () => {
    expect(render({})).toContain("height:44px");
    expect(render({ email: "k@example.com" })).toContain("height:44px");
  });
});

describe("accountInitial", () => {
  it("uppercases the first letter of the email", () => {
    expect(accountInitial("badhemi90@gmail.com")).toBe("B");
  });
  it("skips leading punctuation", () => {
    expect(accountInitial(".kraig@example.com")).toBe("K");
  });
  it("accepts digits and non-Latin letters", () => {
    expect(accountInitial("90s@example.com")).toBe("9");
    expect(accountInitial("élan@example.com")).toBe("É");
  });
  it("falls back to a dot when there is nothing usable", () => {
    expect(accountInitial("")).toBe("•");
    expect(accountInitial(null)).toBe("•");
  });
});

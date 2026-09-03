import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The account card is a trust surface (Profile spec P0-6/P0-7): its copy is a
// contract, so these tests pin the EXACT strings — literals on purpose, not
// ACCOUNT_COPY references. A reworded constant should fail here and route the
// change through the spec's copy inventory first.

let mockAccount;
vi.mock("../hooks/useAccount.js", () => ({ useAccount: () => mockAccount }));

import SettingsSheet from "./SettingsSheet.jsx";

const base = { configured: true, email: null, syncing: false, lastSync: 0, lastError: "", pendingLink: false };
const render = (account) => {
  mockAccount = { ...base, ...account };
  // Static markup escapes apostrophes — decode so copy asserts read naturally.
  return renderToStaticMarkup(<SettingsSheet open tripCount={1} onClose={() => {}} />)
    .replaceAll("&#x27;", "'");
};

describe("SettingsSheet — state-aware subtitle (kills the local-only lie)", () => {
  it("invites sign-in when configured and signed out", () => {
    expect(render({})).toContain("Your trips can follow you — sign in below.");
  });

  it("confirms sync when signed in", () => {
    expect(render({ email: "k@example.com" })).toContain("Synced to your account.");
  });

  it("keeps the honest local-only line on unconfigured builds", () => {
    const html = render({ configured: false });
    expect(html).toContain("Everything stays on this device.");
    expect(html).not.toContain("sign in below");
  });
});

describe("SettingsSheet — signed-in account card", () => {
  it("states the sync contract, verbatim", () => {
    expect(render({ email: "k@example.com" })).toContain(
      "Trips save to this device instantly and to your account whenever you're online — if you edit on two devices, the newest change wins."
    );
  });

  it("hides Last synced until a sync has completed this session", () => {
    expect(render({ email: "k@example.com", lastSync: 0 })).not.toContain("Last synced");
  });

  it("shows Last synced with a relative time once one has", () => {
    const html = render({ email: "k@example.com", lastSync: Date.now() - 10_000 });
    expect(html).toContain("Last synced");
    expect(html).toContain("just now");
  });

  it("renders Sign out as a plain button first — the confirm card is not pre-armed", () => {
    const html = render({ email: "k@example.com" });
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Your trips stay on this device. Your account keeps its own copy.");
  });
});

describe("SettingsSheet — signed-out card", () => {
  it("offers the email field, not leftovers from other states", () => {
    const html = render({});
    expect(html).toContain("Email me a link");
    expect(html).not.toContain("Check your email");
    expect(html).not.toContain("Last synced");
  });

  it("shows the waiting state after a link is sent", () => {
    expect(render({ pendingLink: true })).toContain("Check your email");
  });
});

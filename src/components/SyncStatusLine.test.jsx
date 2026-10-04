import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { syncStatus } from "../lib/utils.js";

// Sync status line (Profile spec P0-3). Copy is pinned as literals on purpose:
// a reworded constant should fail here and go through the spec first.

let mockAccount, mockOnline;
vi.mock("../hooks/useAccount.js", () => ({ useAccount: () => mockAccount }));
vi.mock("../hooks/useOnline.js", () => ({ useOnline: () => mockOnline }));

import SyncStatusLine from "./SyncStatusLine.jsx";
import ProfileChip from "./ProfileChip.jsx";

const base = { configured: true, email: null, syncing: false, lastSync: 0, lastError: "", pendingLink: false, retryPending: false };
const acct = (o) => ({ ...base, ...o });
const render = (account, online = true) => {
  mockAccount = acct(account); mockOnline = online;
  return renderToStaticMarkup(<SyncStatusLine onSignIn={() => {}} />).replaceAll("&#x27;", "'");
};

describe("syncStatus — which state is true", () => {
  it("says nothing on builds without accounts", () => {
    expect(syncStatus(acct({ configured: false }))).toBe(null);
  });
  it("signed out is local-only, online or not", () => {
    expect(syncStatus(acct({}), true).kind).toBe("local");
    expect(syncStatus(acct({}), false).kind).toBe("local");
  });
  it("offline outranks every signed-in state", () => {
    expect(syncStatus(acct({ email: "k@x.co", syncing: true, lastSync: 5 }), false).kind).toBe("offline");
  });
  it("saving while a sync is in flight", () => {
    expect(syncStatus(acct({ email: "k@x.co", syncing: true, lastSync: 5 })).kind).toBe("saving");
  });
  it("a failed sync never reads as saved, even with an older success", () => {
    expect(syncStatus(acct({ email: "k@x.co", lastSync: 5, lastError: "x", retryPending: true })).kind).toBe("retry");
    expect(syncStatus(acct({ email: "k@x.co", lastSync: 5, lastError: "x", retryPending: false })).kind).toBe("stalled");
  });
  it("saved carries the sync time", () => {
    expect(syncStatus(acct({ email: "k@x.co", lastSync: 1234 }))).toEqual({ kind: "saved", at: 1234 });
  });
  it("says nothing before the first sync of the session finishes", () => {
    expect(syncStatus(acct({ email: "k@x.co" }))).toBe(null);
  });
});

describe("SyncStatusLine — what the traveler reads", () => {
  it("renders nothing when there is nothing honest to say", () => {
    expect(render({ configured: false })).toBe("");
    expect(render({ email: "k@x.co" })).toBe("");
  });
  it("signed out: local-only line with the sign-in action", () => {
    const html = render({});
    expect(html).toContain("On this device only");
    expect(html).toContain(">Sign in to back up</button>");
  });
  it("saved: account line with a relative time", () => {
    expect(render({ email: "k@x.co", lastSync: Date.now() - 5000 })).toContain("Saved to your account · just now");
  });
  it("saving: in-flight line with the pulsing dot", () => {
    const html = render({ email: "k@x.co", syncing: true });
    expect(html).toContain("Saving to your account…");
    expect(html).toContain("wsync-dot wsync-pulse");
  });
  it("offline: says where the changes are and what happens next", () => {
    expect(render({ email: "k@x.co", lastSync: 5 }, false))
      .toContain("Offline — saved on this device, will sync when you're back");
  });
  it("failed sync: promises a retry only while one is scheduled", () => {
    expect(render({ email: "k@x.co", lastError: "x", retryPending: true })).toContain("Saved on this device — sync will retry shortly");
    const stalled = render({ email: "k@x.co", lastError: "x", retryPending: false });
    expect(stalled).toContain("Saved on this device — not synced yet");
    expect(stalled).not.toContain("retry");
  });
  it("never shows a sign-in action to a signed-in traveler", () => {
    expect(render({ email: "k@x.co", lastSync: 5 })).not.toContain("Sign in to back up");
  });
  it("is announced as a status region and guards its motion", () => {
    const html = render({ email: "k@x.co", syncing: true });
    expect(html).toContain('role="status"');
    expect(html).toContain("prefers-reduced-motion");
  });
});

describe("ProfileChip — the ember quickens during a sync", () => {
  it("adds the fast class only while syncing", () => {
    mockAccount = acct({ email: "k@x.co", syncing: true });
    expect(renderToStaticMarkup(<ProfileChip />)).toContain('class="wchip-orbit wchip-fast"');
    mockAccount = acct({ email: "k@x.co" });
    expect(renderToStaticMarkup(<ProfileChip />)).toContain('class="wchip-orbit"');
  });
});

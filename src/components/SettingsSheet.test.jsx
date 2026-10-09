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

  it("shows the waiting room after a link is sent", () => {
    expect(render({ pendingLink: true, pendingEmail: "k@x.co", linkSentAt: Date.now() })).toContain("Link sent to ");
  });
});

describe("SettingsSheet — Clear my data is offered only where no trip is open", () => {
  it("shows the action by default (welcome)", () => {
    expect(render({})).toContain("Clear my data");
  });

  it("hides the action when the caller turns showData off (dashboard)", () => {
    mockAccount = { ...base };
    const html = renderToStaticMarkup(<SettingsSheet open tripCount={1} onClose={() => {}} showData={false} />);
    expect(html).not.toContain("Clear my data");
    expect(html).toContain("Time format"); // the rest of the sheet is intact
  });
});

describe("SettingsSheet — magic-link waiting room (spec P0-4)", () => {
  const sent = { pendingLink: true, pendingEmail: "kraig@example.com", linkSentAt: Date.now() };

  it("names the address the link went to", () => {
    const html = render(sent);
    expect(html).toContain("Link sent to ");
    expect(html).toContain("kraig@example.com");
    expect(html).toContain("open it on this device and you're in");
  });

  it("locks resend behind a countdown right after a send", () => {
    const html = render(sent);
    expect(html).toMatch(/Resend in \d+s/);
    expect(html).toContain("disabled");
    expect(html).not.toContain(">Resend link<");
  });

  it("unlocks resend once the wait has passed", () => {
    const html = render({ ...sent, linkSentAt: Date.now() - 31_000 });
    expect(html).toContain(">Resend link<");
  });

  it("offers Wrong address? while waiting", () => {
    expect(render(sent)).toContain(">Wrong address?<");
  });

  it("expired link: explains, prefills the address, offers a fresh link", () => {
    const html = render({ pendingLink: false, pendingEmail: "kraig@example.com", linkExpired: true });
    expect(html).toContain("That sign-in link has expired — send yourself a fresh one.");
    expect(html).toContain('value="kraig@example.com"');
    expect(html).toContain("Send a fresh link");
  });

  it("send failure copy shows in the waiting room and the form, never raw", () => {
    const copy = "Can't reach the sign-in service right now — try again in a few minutes.";
    expect(render({ ...sent, lastError: copy })).toContain(copy);
    expect(render({ lastError: copy })).toContain(copy);
  });
});

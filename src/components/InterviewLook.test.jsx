import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { T, STEPS } from "../lib/constants.js";
import { chipSt, fieldSt, primaryBtnSt } from "../lib/styles.js";
import InterviewFlow, { ProgressLine } from "./InterviewFlow.jsx";
import BudgetTiers from "./BudgetTiers.jsx";

// Interview, Transit Diagram version (redesign direction E, step 3b).

const baseProps = {
  step: 1, stepNumber: 2, stepTotal: 6, direction: 1,
  onWelcome: () => {}, onAdvance: () => {}, onBack: () => {},
  cur: "", setCur: () => {}, chips: ["Couple"], setChips: () => {},
  priorityChips: [], setPriorityChips: () => {}, teams: [], setTeams: () => {},
  kids: "", setKids: () => {}, avoidText: "", setAvoidText: () => {},
  budget: 120, setBudget: () => {},
  d1: "", setD1: () => {}, d2: "", setD2: () => {},
  logStay: "", setLogStay: () => {}, logTransport: "", setLogTransport: () => {},
  logPace: "", setLogPace: () => {}, logFocus: "", setLogFocus: () => {},
  logRhythm: "", setLogRhythm: () => {},
  isValid: true, setBucketNow: () => {}, setBucketWhen: () => {},
};

describe("ProgressLine", () => {
  const html = renderToStaticMarkup(<ProgressLine num={2} total={6} />);

  it("is a progressbar with the step as its value", () => {
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Step 2 of 6"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuemax="6"');
  });

  it("draws one station per step", () => {
    expect(html.match(/<svg/g)).toHaveLength(6);
  });

  it("fills the line to the current station (1 of 5 gaps = 20%)", () => {
    expect(html).toContain("width:20%");
    expect(html).toContain(T.line[0]);
  });

  it("does not divide by zero for a one-step run", () => {
    expect(renderToStaticMarkup(<ProgressLine num={1} total={1} />)).toContain("width:0%");
  });
});

describe("InterviewFlow look", () => {
  const html = renderToStaticMarkup(<InterviewFlow {...baseProps} />);

  it("shows the step as text and as the line", () => {
    expect(html).toContain("Step 2 of 6");
    expect(html).toContain('role="progressbar"');
  });

  it("renders the question as the one h1", () => {
    expect(html).toContain(`>${STEPS[1].q.replace("'", "&#x27;")}</h1>`);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("marks the selected chip for assistive technology", () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("has no uppercase letterspaced labels (retired)", () => {
    for (let step = 0; step < STEPS.length; step++) {
      const page = renderToStaticMarkup(<InterviewFlow {...baseProps} step={step} stepNumber={step + 1} chips={[]} />);
      expect(page).not.toContain("text-transform:uppercase");
    }
  });

  it("keeps the same six questions", () => {
    expect(STEPS).toHaveLength(6);
  });
});

describe("shared control styles", () => {
  it("a chip keeps one weight in both states, so a toggle cannot reflow", () => {
    expect(chipSt(true).fontWeight).toBe(chipSt(false).fontWeight);
  });

  it("a selected chip is ink with white text", () => {
    expect(chipSt(true).background).toBe(T.ink);
    expect(chipSt(true).color).toBe(T.white);
  });

  it("chips and the primary button meet the touch-target floor", () => {
    expect(chipSt(false, { small: true }).minHeight).toBeGreaterThanOrEqual(40);
    expect(chipSt(false).minHeight).toBeGreaterThanOrEqual(44);
    expect(primaryBtnSt().minHeight).toBeGreaterThanOrEqual(44);
  });

  it("fields use the light color scheme", () => {
    expect(fieldSt.colorScheme).toBe("light");
  });

  it("a disabled primary button does not use the accent", () => {
    expect(primaryBtnSt(false).background).not.toBe(T.accent);
  });
});

describe("BudgetTiers", () => {
  const html = renderToStaticMarkup(<BudgetTiers value={120} onChange={() => {}} />);

  it("renders the tiers as rows with exactly one pressed", () => {
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
  });
});

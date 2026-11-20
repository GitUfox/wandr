import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RailFork } from "./WelcomeScreen.jsx";
import InterviewFlow from "./InterviewFlow.jsx";
import { T } from "../lib/constants.js";

// Welcome fork (design pick 1F, Transit Diagram version) + the bucket branch of the dates step.

describe("RailFork", () => {
  const html = renderToStaticMarkup(<RailFork onPick={() => {}} noMotion />);

  it("renders both branch pills with their teaching sublabels", () => {
    expect(html).toContain("Full itinerary");
    expect(html).toContain("day-by-day plan");
    expect(html).toContain("Bucket list");
    expect(html).toContain("just the activities");
  });

  it("is an accessible choice group", () => {
    expect(html).toContain("Choose how to build this trip");
    expect(html).toContain("Full itinerary — a day-by-day plan");
    expect(html).toContain("Bucket list — just the activities, no dates");
  });

  it("draws the two branches as day lines 1 and 2, with no path data", () => {
    expect(html).toContain(`stroke="${T.line[0]}"`);
    expect(html).toContain(`stroke="${T.line[1]}"`);
    expect(html).toContain("<polyline");
    expect(html).not.toContain("<path");
  });

  it("ends each line at the center of its button (geometry contract)", () => {
    // 320px box, 12px gap: two 154px buttons with centers at x = 77 and 243.
    expect(html).toContain("77,72 77,74");
    expect(html).toContain("243,72 243,74");
    expect(html).toContain("width:320px");
    expect(html).toContain("gap:12px");
  });

  it("removes transitions when motion is off (harness / reduced-motion)", () => {
    expect(html).toContain('data-still="true"');
    expect(html).toContain("transition:none");
  });

  it("keeps the line transition when motion is on", () => {
    const live = renderToStaticMarkup(<RailFork onPick={() => {}} />);
    expect(live).not.toContain("data-still");
    expect(live).toContain("transition:stroke .25s");
  });

  it("has no ember or glow (retired with the Transit Diagram redesign)", () => {
    expect(html).not.toContain("ember");
    expect(html).not.toContain("drop-shadow");
  });
});

describe("InterviewFlow — bucket dates step (now? / when?)", () => {
  const baseProps = {
    step: 0, stepNumber: 1, stepTotal: 6, direction: 1,
    onWelcome: () => {}, onAdvance: () => {}, onBack: () => {},
    cur: "", setCur: () => {}, chips: [], setChips: () => {},
    priorityChips: [], setPriorityChips: () => {}, teams: [], setTeams: () => {},
    kids: "", setKids: () => {}, avoidText: "", setAvoidText: () => {},
    budget: 120, setBudget: () => {},
    d1: "", setD1: () => {}, d2: "", setD2: () => {},
    logStay: "", setLogStay: () => {}, logTransport: "", setLogTransport: () => {},
    logPace: "", setLogPace: () => {}, logFocus: "", setLogFocus: () => {},
    logRhythm: "", setLogRhythm: () => {},
    isValid: false,
    setBucketNow: () => {}, setBucketWhen: () => {},
  };

  it("bucket mode asks now?/not-yet instead of the calendar", () => {
    const html = renderToStaticMarkup(<InterviewFlow {...baseProps} tripStyle="bucket" bucketNow="" bucketWhen="" />);
    expect(html).toContain("Going now");
    expect(html).toContain("Not yet");
    expect(html).not.toContain("Start date"); // DateRangePicker never mounts
  });

  it('"not yet" reveals the optional free-text when?', () => {
    const html = renderToStaticMarkup(<InterviewFlow {...baseProps} tripStyle="bucket" bucketNow="later" bucketWhen="" />);
    expect(html).toContain("When, roughly?");
    expect(html).toContain("next summer · December · someday");
  });

  it('"going now" explains the season lean instead of asking more', () => {
    const html = renderToStaticMarkup(<InterviewFlow {...baseProps} tripStyle="bucket" bucketNow="now" bucketWhen="" />);
    expect(html).toContain("this time of year");
    expect(html).not.toContain("When, roughly?");
  });

  it("itinerary mode still gets the calendar and no bucket chips", () => {
    const html = renderToStaticMarkup(<InterviewFlow {...baseProps} tripStyle="itinerary" bucketNow="" bucketWhen="" />);
    expect(html).not.toContain("Going now");
  });

  it("the final step's CTA says list, not trip, in bucket mode", () => {
    const html = renderToStaticMarkup(<InterviewFlow {...baseProps} step={5} stepNumber={6} tripStyle="bucket" bucketNow="now" bucketWhen="" />);
    expect(html).toContain("Build my list →");
    expect(html).not.toContain("Build my trip →");
  });
});

describe("input caps (security sweep 2026-08-15)", () => {
  const baseProps = {
    step: 0, stepNumber: 1, stepTotal: 6, direction: 1,
    onWelcome: () => {}, onAdvance: () => {}, onBack: () => {},
    cur: "", setCur: () => {}, chips: [], setChips: () => {},
    priorityChips: [], setPriorityChips: () => {}, teams: [], setTeams: () => {},
    kids: "", setKids: () => {}, avoidText: "", setAvoidText: () => {},
    budget: 120, setBudget: () => {},
    d1: "", setD1: () => {}, d2: "", setD2: () => {},
    logStay: "", setLogStay: () => {}, logTransport: "", setLogTransport: () => {},
    logPace: "", setLogPace: () => {}, logFocus: "", setLogFocus: () => {},
    logRhythm: "", setLogRhythm: () => {},
    isValid: false,
    setBucketNow: () => {}, setBucketWhen: () => {},
  };

  it("the bucket when? field is capped at a season phrase", () => {
    const html = renderToStaticMarkup(<InterviewFlow {...baseProps} tripStyle="bucket" bucketNow="later" bucketWhen="" />);
    expect(html).toContain('maxLength="80"');
  });

  it("the notes step caps its textarea and avoid field", () => {
    const html = renderToStaticMarkup(<InterviewFlow {...baseProps} step={5} stepNumber={6} tripStyle="itinerary" bucketNow="" bucketWhen="" />);
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain('maxLength="300"');
  });
});

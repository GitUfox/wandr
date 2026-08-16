import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RailFork } from "./WelcomeScreen.jsx";
import InterviewFlow from "./InterviewFlow.jsx";

// Welcome fork (design pick 1F) + the bucket branch of the dates step.

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

  it("parks the ember when motion is off (harness / reduced-motion)", () => {
    expect(html).toContain("wrf-ember wrf-still");
  });

  it("idles the ember when motion is on", () => {
    const live = renderToStaticMarkup(<RailFork onPick={() => {}} />);
    expect(live).toContain('class="wrf-ember"');
    expect(live).not.toContain("wrf-still");
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

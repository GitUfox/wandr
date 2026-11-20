/**
 * Motion contract. Transit Diagram redesign, step 4.
 *
 * Motion is a layer on top of complete static screens. These tests pin:
 *   1. Every motion class has a keyframe and is in the reduced-motion guard.
 *   2. Components take motion classes only through motion() or a `still`
 *      switch, so the harness flag and reduced motion can turn them off.
 *   3. The arrival stagger is capped, so a long plan does not wait.
 *   4. No retired motion (ember, glow, burst) came back.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { parsePlan } from "./planModel.js";
import { motion, delay } from "./styles.js";

vi.mock("../hooks/useOnline.js", () => ({ useOnline: () => true }));

import ItineraryEditor, { stopDelayMs } from "../components/ItineraryEditor.jsx";
import { RailFork } from "../components/WelcomeScreen.jsx";
import { TripStrip } from "../components/Dashboard.jsx";

const css = readFileSync("src/index.css", "utf8");
const CLASSES = ["t-draw", "t-grow-y", "t-grow-x", "t-pop", "t-rise", "t-breathe", "t-travel", "t-arrive"];

describe("motion classes in index.css", () => {
  it.each(CLASSES)(".%s is defined with an animation", (cls) => {
    expect(css).toMatch(new RegExp(`\\.${cls}\\s*\\{[^}]*animation:`));
  });

  it("turns every class off for prefers-reduced-motion", () => {
    const guard = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const cls of CLASSES) expect(guard).toContain(`.${cls}`);
    expect(guard).toContain("animation: none !important");
  });

  it("uses no glow in any keyframe", () => {
    const block = css.slice(css.indexOf("Transit Diagram motion"));
    expect(block).not.toContain("box-shadow");
    expect(block).not.toContain("drop-shadow");
  });
});

describe("motion helpers", () => {
  it("motion() passes the class through when motion is on", () => {
    expect(motion("t-pop")).toBe("t-pop");
  });
  it("delay() gives a rounded inline stagger", () => {
    expect(delay(119.6)).toEqual({ animationDelay: "120ms" });
  });
});

describe("arrival stagger", () => {
  it("starts days 150ms apart and stops 110ms apart", () => {
    expect(stopDelayMs(0, 0)).toBe(0);
    expect(stopDelayMs(0, 2)).toBe(220);
    expect(stopDelayMs(1, 0)).toBe(150);
  });
  it("is capped, so day 10 does not wait longer than 1.4s", () => {
    expect(stopDelayMs(9, 5)).toBe(1400);
  });
});

describe("components use the motion classes", () => {
  const plan = parsePlan(`## Day 1 — Thursday

TABLE:
| Time | Activity | Details |
|------|----------|----------|
| 09:30 | **Miradouro de Santa Luzia** | A viewpoint. · free |
| 11:00 | **Museu Nacional do Azulejo** | Tile. · ~€8 · book ahead |
ENDTABLE
`);
  const noop = () => {};

  it("itinerary: each stop pops, rises and grows its line, in order", () => {
    const html = renderToStaticMarkup(
      <ItineraryEditor model={plan} categories={{}} onEditActivity={noop} onDeleteActivity={noop}
        onReorderDay={noop} onMoveActivity={noop} onMoveToBucket={noop} onTweakActivity={noop} />
    );
    expect(html.match(/class="t-pop"/g)).toHaveLength(2);
    expect(html.match(/class="t-grow-y"/g)).toHaveLength(2);
    expect(html.match(/class="t-rise"/g)).toHaveLength(2);
    expect(html).toContain("animation-delay:110ms"); // the second station
    expect(html).toContain("animation-delay:230ms"); // its line, 120ms later
  });

  it("fork: the lines draw and the buttons rise when motion is on", () => {
    const live = renderToStaticMarkup(<RailFork onPick={noop} />);
    expect(live.match(/class="t-draw"/g)).toHaveLength(2);
    expect(live.match(/pathLength="1"/g)).toHaveLength(2);
    expect(live).toContain('class="t-rise"');
  });

  it("fork: no motion class when motion is off", () => {
    const still = renderToStaticMarkup(<RailFork onPick={noop} noMotion />);
    expect(still).not.toContain("t-draw");
    expect(still).not.toContain("t-rise");
  });

  it("trip strip: bars grow in day order and the today station breathes", () => {
    const html = renderToStaticMarkup(<TripStrip dep="NOV 19" ret="NOV 23" nights={4} todayInfo={{ dayNum: 2, totalDays: 5 }} />);
    expect(html.match(/class="t-grow-x"/g)).toHaveLength(5);
    expect(html).toContain("animation-delay:240ms"); // the fifth bar
    expect(html.match(/class="t-breathe"/g)).toHaveLength(1);
  });
});

describe("retired motion stays retired", () => {
  const dir = "src/components";
  const sources = readdirSync(dir).filter(f => f.endsWith(".jsx") && !f.includes(".test.")).map(f => [f, readFileSync(`${dir}/${f}`, "utf8")]);

  it.each(sources)("%s has no stardust burst, travelling ember or glow keyframe", (_, src) => {
    expect(src).not.toContain("StardustBurst");
    expect(src).not.toContain("wtravel");
    expect(src).not.toMatch(/@keyframes[^}]*box-shadow/);
  });
});

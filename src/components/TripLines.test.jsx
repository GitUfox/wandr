import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { T } from "../lib/constants.js";
import { parsePlan } from "../lib/planModel.js";

vi.mock("../hooks/useOnline.js", () => ({ useOnline: () => true }));

import ItineraryEditor, { stationKind, dayLineColor } from "./ItineraryEditor.jsx";
import { TripStrip } from "./Dashboard.jsx";

// Trip dashboard and itinerary, Transit Diagram version (direction E, step 3c).

const PLAN = `## Day 1 — Thursday

TABLE:
| Time | Activity | Details |
|------|----------|----------|
| 09:30 | **Miradouro de Santa Luzia** | A viewpoint over Alfama. · free · 45 min |
| 11:00 | **Museu Nacional do Azulejo** | Portuguese tile. · ~€8 · 2h · book ahead |
| 19:30 | **LX Factory** | Shops and bars. · free entry |
ENDTABLE

TIPS: Wear shoes with grip

## Day 2 — Friday

TABLE:
| Time | Activity | Details |
|------|----------|----------|
| 10:00 | **Belém Tower** | River fortress. · ~€8 · 1h |
ENDTABLE
`;
const noop = () => {};
const render = () => renderToStaticMarkup(
  <ItineraryEditor model={parsePlan(PLAN)} categories={{}} onEditActivity={noop} onDeleteActivity={noop}
    onReorderDay={noop} onMoveActivity={noop} onMoveToBucket={noop} onTweakActivity={noop} />
);

describe("stationKind", () => {
  it("is a plain stop by default", () => {
    expect(stationKind("A viewpoint. · free · 45 min", false)).toBe("stop");
  });
  it("is the end bar for the last stop of the day", () => {
    expect(stationKind("Shops and bars. · free entry", true)).toBe("end");
  });
  it("lets a booking win over the last-stop bar (the booking is the action)", () => {
    expect(stationKind("Dinner show. · ~€40 · book ahead", true)).toBe("book");
  });
  it("tolerates an empty details cell", () => {
    expect(stationKind("", false)).toBe("stop");
    expect(stationKind(undefined, true)).toBe("end");
  });
});

describe("dayLineColor", () => {
  it("takes the line colors in day order and wraps after the fifth", () => {
    expect(dayLineColor(0)).toBe(T.line[0]);
    expect(dayLineColor(4)).toBe(T.line[4]);
    expect(dayLineColor(5)).toBe(T.line[0]);
  });
});

describe("ItineraryEditor as day lines", () => {
  const html = render();

  it("renders one day line group per day", () => {
    expect(html.match(/data-day-line=/g)).toHaveLength(2);
  });

  it("draws one line segment per stop, in the day's color", () => {
    expect(html.match(/data-line-segment/g)).toHaveLength(4);
    expect(html).toContain(`background:${T.line[0]}`);
    expect(html).toContain(`background:${T.line[1]}`);
  });

  it("starts the line at the first station and stops it at the last", () => {
    // First stop: the segment starts at the station center and runs down.
    expect(html).toContain("top:24px;bottom:0");
    // Last stop of a 3-stop day: from the row top to the station center.
    expect(html).toContain("top:0;height:24px");
    // A one-stop day has no line to draw.
    expect(html).toContain("top:24px;height:0");
  });

  it("uses a day header h2 with the stop count", () => {
    expect(html.match(/<h2/g)).toHaveLength(2);
    expect(html).toContain("3 stops");
    expect(html).toContain("1 stop<");
  });

  it("shows facts as plain text, with no boxed chips or uppercase labels", () => {
    expect(html).toContain("book ahead");
    expect(html).not.toContain("text-transform:uppercase");
  });

  it("keeps the labeled action bar for each stop", () => {
    for (const label of ["Tweak", "Move", "Edit", "Remove"]) expect(html).toContain(`>${label}</span>`);
  });
});

describe("TripStrip", () => {
  it("draws one bar per day between the two dates", () => {
    const html = renderToStaticMarkup(<TripStrip dep="NOV 19" ret="NOV 23" nights={4} stubs={[["Nights", "4"]]} />);
    expect(html).toContain("Nov 19");
    expect(html).toContain("Nov 23");
    expect(html).toContain('aria-label="5 days"');
    for (const color of T.line) expect(html).toContain(`background:${color}`);
    expect(html).not.toContain("<svg"); // no today marker outside the trip dates
  });

  it("puts a station on today's bar during the trip", () => {
    const html = renderToStaticMarkup(<TripStrip dep="NOV 19" ret="NOV 23" nights={4} todayInfo={{ dayNum: 2, totalDays: 5 }} />);
    expect(html).toContain('aria-label="Day 2 of 5"');
    expect(html.match(/<svg/g)).toHaveLength(1);
  });

  it("shows ideas and picks for a bucket list, with no dates", () => {
    const html = renderToStaticMarkup(<TripStrip isBucket ideaCount={9} pickedCount={2} dep="" ret="" />);
    expect(html).toContain("9 ideas · 2 picked");
    expect(html.match(/<svg/g)).toHaveLength(9);
  });

  it("caps a long trip so the bars stay readable", () => {
    const html = renderToStaticMarkup(<TripStrip dep="JAN 1" ret="JAN 31" nights={30} />);
    expect(html.match(/flex:1/g)).toHaveLength(14);
    expect(html).toContain('aria-label="31 days"');
  });
});

describe("dashboard source", () => {
  const src = readFileSync("src/components/Dashboard.jsx", "utf8");
  const screen = src.slice(src.indexOf("  return (\n    <div style={{ minHeight:\"100vh\""));

  it("has no boarding-pass ticket, ember or uppercase labels on screen", () => {
    expect(screen).not.toContain("Boarding-pass ticket");
    expect(screen).not.toContain("wtravel");
    expect(screen).not.toContain('textTransform:"uppercase"');
  });
});

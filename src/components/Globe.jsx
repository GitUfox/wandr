/**
 * Globe — slowly rotating 3D globe rendered on a canvas, in Wandr orange.
 *
 * Orthographic projection (d3-geo) over the world-atlas countries TopoJSON.
 * Used as the animated "period" in the start-page wordmark (see WandrLogo).
 *
 * Lazy-loaded by WandrLogo so d3-geo + topojson + the country data land in a
 * separate async chunk that only loads on the welcome screen. The rAF loop is
 * cancelled on unmount, so navigating away never leaks an animation frame.
 */
import { useEffect, useRef } from "react";
import { geoOrthographic, geoGraticule10, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import world from "world-atlas/countries-110m.json";

// Wandr orange #c96442 = rgb(201,100,66), layered at varying opacity.
const SCHEME = {
  sphere:  "201,100,66,0.05",
  grat:    "201,100,66,0.16",
  land:    "201,100,66,0.20",
  border:  "201,100,66,0.95",
  outline: "201,100,66,0.62",
};

export default function Globe({ size = 36, style }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const graticule = geoGraticule10();
    const land    = feature(world, world.objects.countries);
    const borders = mesh(world, world.objects.countries, (a, b) => a !== b);

    const R  = size / 2 - 1.5;
    const cx = size / 2, cy = size / 2;

    function draw(rot) {
      const projection = geoOrthographic()
        .scale(R)
        .translate([cx, cy])
        .clipAngle(90)
        .rotate([rot, -16]);
      const path = geoPath(projection, ctx);

      ctx.clearRect(0, 0, size, size);

      ctx.beginPath(); path({ type: "Sphere" });
      ctx.fillStyle = `rgba(${SCHEME.sphere})`; ctx.fill();

      ctx.beginPath(); path(graticule);
      ctx.lineWidth = 0.5; ctx.strokeStyle = `rgba(${SCHEME.grat})`; ctx.stroke();

      ctx.beginPath(); path(land);
      ctx.fillStyle = `rgba(${SCHEME.land})`; ctx.fill();

      ctx.beginPath(); path(borders);
      ctx.lineWidth = 0.5; ctx.strokeStyle = `rgba(${SCHEME.border})`; ctx.stroke();

      ctx.beginPath(); path({ type: "Sphere" });
      ctx.lineWidth = 0.9; ctx.strokeStyle = `rgba(${SCHEME.outline})`; ctx.stroke();
    }

    let raf;
    function loop(ms) {
      draw((ms / 1000) * 9.2); // ~9.2°/s → a full turn every ~39s
      raf = requestAnimationFrame(loop);
    }
    draw(0);                       // guaranteed first paint
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: size, height: size, display: "inline-block", ...style }}
    />
  );
}

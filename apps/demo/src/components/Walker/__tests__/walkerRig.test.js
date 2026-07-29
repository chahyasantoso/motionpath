import { describe, expect, it } from "vitest";
import { createTrack } from "@motionpath/core";
import { RIG, walkerScene } from "../walkerMotions.js";

function buildRig() {
  const tracks = new Map(walkerScene.tracks.map((config) => [config.id, createTrack(config)]));
  for (const config of walkerScene.tracks) for (const edge of config.observes || []) tracks.get(config.id).setObserved(tracks.get(edge.source), (patch) => ({ [edge.target]: patch || {} }), { role: edge.role });
  return tracks;
}
const seek = (tracks, p) => { for (const track of tracks.values()) track.progress(p); };
const at = (tracks, id) => tracks.get(id).compose();
const span = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const SAMPLES = [0, 0.13, 0.37, 0.5, 0.71, 0.94, 1];

describe("fk walker rig", () => {
  it("authors a position on the pelvis only", () => {
    for (const track of walkerScene.tracks) {
      if (track.id === "pelvis") { expect(track.observes).toBeUndefined(); expect(Object.keys(track.keyframes).sort()).toEqual(["rotation", "x", "y"]); continue; }
      expect(Object.keys(track.keyframes).sort()).toEqual(["boneLength", "boneRotation"]);
      expect(track.observes).toEqual([{ source: expect.any(String), role: "input", target: "parentWorld" }]);
    }
  });
  it("keeps every joint at its authored bone length through the gait", () => {
    const tracks = buildRig();
    for (const p of SAMPLES) { seek(tracks, p); expect(span(at(tracks, "pelvis"), at(tracks, "chest"))).toBeCloseTo(RIG.torso, 3); for (const side of ["near", "far"]) { expect(span(at(tracks, "pelvis"), at(tracks, `leg-${side}-shin`))).toBeCloseTo(RIG.thigh, 3); expect(span(at(tracks, `leg-${side}-shin`), at(tracks, `leg-${side}-foot`))).toBeCloseTo(RIG.shin, 3); expect(span(at(tracks, "chest"), at(tracks, `arm-${side}-fore`))).toBeCloseTo(RIG.upperArm, 3); } }
  });
  it("moves the head joint from an animated boneLength alone", () => { const tracks = buildRig(); const necks = SAMPLES.map((p) => { seek(tracks, p); return span(at(tracks, "chest"), at(tracks, "head")); }); expect(Math.max(...necks) - Math.min(...necks)).toBeGreaterThan(1); for (const neck of necks) { expect(neck).toBeGreaterThan(RIG.neck - 4); expect(neck).toBeLessThan(RIG.neck + 4); } });
  it("bends the knee, which the old single-key FK contract could not", () => { const tracks = buildRig(); const angles = SAMPLES.map((p) => { seek(tracks, p); return at(tracks, "leg-near-shin").rotation; }); expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(10); });
  it("walks forward and drags the whole body with the pelvis", () => { const tracks = buildRig(); seek(tracks, 0); const start = at(tracks, "pelvis"); const startFoot = at(tracks, "leg-near-foot"); seek(tracks, 1); expect(at(tracks, "pelvis").x).toBeGreaterThan(start.x); expect(at(tracks, "leg-near-foot").x).toBeGreaterThan(startFoot.x); });
});

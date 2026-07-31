import { writeFile } from "node:fs/promises";
import { Engine } from "../packages/core/src/engines/Engine.js";

const samples = [0, 0.25, 0.5, 0.75, 1];

function stops(values, ease) {
  return values.map(([p, v]) => ({ p, v, ...(ease ? { ease } : {}) }));
}

function projectForTracks(tracks) {
  return {
    schemaVersion: 4,
    projectId: "parity-export",
    motions: [{
      id: "fixture-motion",
      trigger: { type: "manual" },
      tracks,
    }],
  };
}

async function sampleMotion(tracks, ids = tracks.map((track) => track.id)) {
  const engine = new Engine();
  await engine.loadProject(projectForTracks(tracks));
  const motion = engine.mountInstance("fixture-motion");
  const result = {};
  for (const progress of samples) {
    motion.seek(progress);
    result[progress] = Object.fromEntries(ids.map((id) => {
      const track = motion.getTrack(id);
      return [id, track.compose(track.getSnapshot())];
    }));
  }
  engine.destroy();
  return result;
}

async function exportFixtures() {
  const fixtures = {
    format: "motionpath-parity-fixtures",
    formatVersion: 1,
    source: "chahyasantoso/motionpath",
    generatedAt: new Date().toISOString(),
    sampleProgress: samples,
    tolerance: 1e-9,
    cases: {},
  };

  fixtures.cases.easing = await sampleMotion([{
    id: "easing",
    duration: 1,
    keyframes: {
      value: { stops: stops([[0, 0], [1, 100]], "power2.in") },
    },
  }]);

  fixtures.cases.transformsAndColors = await sampleMotion([{
    id: "render-contract",
    duration: 1,
    keyframes: {
      x: { stops: stops([[0, 0], [1, 100]]) },
      y: { stops: stops([[0, 40], [1, -40]]) },
      rotation: { stops: stops([[0, 0], [1, 90]]) },
      scale: { stops: stops([[0, 1], [1, 2]]) },
      opacity: { stops: stops([[0, 0], [1, 1]]) },
      color: { stops: stops([[0, "#000000"], [1, "#ffffff"]]) },
    },
  }]);

  fixtures.cases.filters = await sampleMotion([{
    id: "filters",
    duration: 1,
    keyframes: {
      blur: { stops: stops([[0, 0], [1, 8]]) },
      brightness: { stops: stops([[0, 1], [1, 1.5]]) },
    },
  }]);

  fixtures.cases.imageSequence = await sampleMotion([{
    id: "images",
    duration: 1,
    keyframes: {
      imageSequence: {
        stops: stops([[0, 0], [1, 3]]),
        frames: ["frame-0.png", "frame-1.png", "frame-2.png", "frame-3.png"],
      },
    },
  }]);

  fixtures.cases.observationGraph = await sampleMotion([
    {
      id: "source",
      duration: 1,
      keyframes: { x: { stops: stops([[0, 0], [1, 100]]) } },
    },
    {
      id: "consumer",
      duration: 1,
      keyframes: { opacity: { stops: stops([[0, 0.2], [1, 1]]) } },
      observes: [{ source: "source", role: "output" }],
    },
  ]);

  fixtures.cases.lifecycle = {
    mount: "fixture-motion",
    sampleProgress: samples,
    graphOrder: ["easing"],
    destroy: "engine.destroy() releases the mounted motion and its tracks",
  };

  process.stdout.write(`${JSON.stringify(fixtures, null, 2)}\n`);
}

exportFixtures().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

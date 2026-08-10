import { fileURLToPath, URL } from "node:url";

const coreSrc = fileURLToPath(new URL("./packages/core/src", import.meta.url));
const reactHooks = fileURLToPath(
  new URL("./packages/react/src/hooks", import.meta.url),
);
const resolveAliases = [
  { find: /^@motionpath\/core\/(.*)$/, replacement: `${coreSrc}/$1` },
  { find: /^@motionpath\/react\/(.*)$/, replacement: `${reactHooks}/$1` },
];

export default {
  resolve: { alias: resolveAliases },
  test: {
    globals: true,
    alias: resolveAliases,
    include: [
      "packages/core/src/lib/__tests__/Track.observation.test.js",
      "packages/core/src/lib/__tests__/Track.standalone-adapter.test.js",
      "packages/core/src/lib/__tests__/Track.test.js",
      "packages/core/src/lib/__tests__/Track.v43.test.js",
      "packages/core/src/lib/__tests__/createTrack.standalone-adapter.test.js",
      "packages/core/src/usecases/__tests__/GraphBinding.initial-wiring.test.js",
      "packages/core/src/usecases/__tests__/GraphBinding.transaction.test.js",
      "packages/core/src/usecases/__tests__/GraphPublisher.contract.test.js",
      "packages/core/src/usecases/__tests__/GraphPublisher.incremental.test.js",
      "packages/core/src/usecases/__tests__/StandaloneObservationAdapter.test.js",
    ],
  },
};

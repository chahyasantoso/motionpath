export default {
  test: {
    exclude: [
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

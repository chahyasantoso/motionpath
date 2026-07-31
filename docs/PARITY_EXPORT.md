# Cross-repository parity export

This repository is the source of truth for the JavaScript samples consumed by the Flutter port. Do not hand-edit generated fixture values.

## Generate the fixture

From the repository root:

```bash
npm ci
node scripts/export-parity-fixtures.mjs > /tmp/motionpath-parity-fixtures.json
```

Paste the complete JSON output into the Flutter parity PR. The timestamp is metadata only and must not be used in comparisons.

## Contract

The exporter samples the public v4 path: `Engine.loadProject`, `Engine.mountInstance`, `Motion.seek`, `Track.getSnapshot`, and `Track.compose`. It intentionally does not inspect GSAP internals or serialize DOM output.

Each case is sampled at normalized progress `0`, `0.25`, `0.5`, `0.75`, and `1`. Numeric values use the declared tolerance of `1e-9`; discrete values, arrays, and object keys compare exactly. The expected fixture is renderer-neutral JSON, so Flutter can compare composition without importing browser behavior.

The cases cover easing, renderer transform/color output, grouped filters, image-frame selection, observation graph composition, and lifecycle metadata. If an exporter case fails because the current JS schema rejects a plugin shape, paste the exact error instead of editing the case locally. The fixture schema is deliberately versioned so a correction is visible rather than silently changing parity.

## Security and determinism

Only checked-in schemas and literal frame names are used. No network, filesystem input, DOM, or user-controlled module loading is involved. `generatedAt` is informational and should be removed or ignored before committing fixture data.

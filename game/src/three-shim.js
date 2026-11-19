// Recovery note: the tiny bridge that hands the global THREE object to the ES modules that need it.
// three.js arrives as a classic script (game/vendor/three.min.js) and
// puts THREE on window. ES modules cannot import a global, so this shim
// is the one place that reaches for it. Round 4: fail loudly (instead of
// a cryptic undefined deep in the game) when the vendored script did not
// load, and expose the revision so the game can sanity-check it.
if (typeof window === 'undefined' || !window.THREE) {
  throw new Error('NEON BAY: vendored three.js did not load — window.THREE is missing');
}
export const THREE = window.THREE;
export const THREE_REVISION = window.THREE.REVISION;
export default window.THREE;

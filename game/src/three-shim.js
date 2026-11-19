// three.js arrives as a classic script (game/vendor/three.min.js) and
// puts THREE on window. ES modules cannot import a global, so this shim
// is the one place that reaches for it.
export const THREE = window.THREE;
export default window.THREE;

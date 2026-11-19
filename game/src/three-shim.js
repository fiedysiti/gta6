// The vendored three.js r152 is loaded as a classic script (game/vendor/three.min.js)
// before any module runs, so it is available as window.THREE. This shim re-exports
// that global for ES modules.
export const THREE = window.THREE;
export default THREE;

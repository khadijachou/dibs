// Top-level error boundary wrapped around <App /> in main.jsx, so a render error shows a simple card instead of a blank
// screen (v1.7.4 fix). The implementation lives in lib/errorScreen.js (plain JS) so node --test can render it; this file
// is the component the app imports.
export { default } from '../lib/errorScreen.js'

// A top-level error boundary so a render error never leaves a blank screen (v1.7.4 fix). The class and its fallback card
// live here in plain JS (React.createElement, no JSX) so node --test can import and render them; components/ErrorBoundary.jsx
// re-exports the class for the app to wrap around <App />. The card is self-contained: it reads the language straight from
// localStorage (the app's own i18n/context may be the thing that threw) and its own small string table.
import { Component, createElement as h } from 'react'
import pkg from '../../package.json' with { type: 'json' }

const version = pkg.version

// en / fr (Québec, vous) / es (tú). No em dashes, no "!".
export const ERROR_STRINGS = {
  en: { title: 'Something went wrong on this screen.', safe: 'Your NIM and goals are safe.', reload: 'Reload', copy: 'Copy details', copied: 'Copied' },
  fr: { title: 'Un problème est survenu sur cet écran.', safe: 'Vos NIM et vos objectifs sont en sécurité.', reload: 'Recharger', copy: 'Copier les détails', copied: 'Copié' },
  es: { title: 'Algo salió mal en esta pantalla.', safe: 'Tus NIM y tus objetivos están a salvo.', reload: 'Recargar', copy: 'Copiar los detalles', copied: 'Copiado' },
}

export const errorStrings = (lang) => ERROR_STRINGS[lang] || ERROR_STRINGS.en
const readLang = () => { try { const l = localStorage.getItem('dibs.lang'); return ERROR_STRINGS[l] ? l : 'en' } catch { return 'en' } }

// What "Copy details" copies: the app version and the error message only. Never a wallet address, a code or goal data.
export const errorDetails = (error) => `Dibs ${version}\n${(error && error.message) || String(error || '')}`.trim()

// The fallback card, built with createElement so it renders under node --test (react-dom/server) and in the app alike.
export function FallbackCard({ lang, error, copied, onReload, onCopy }) {
  const t = errorStrings(lang)
  return h('div', { className: 'eb-screen' },
    h('div', { className: 'card eb-card' },
      h('h2', null, t.title),
      h('p', { className: 'small' }, t.safe),
      h('button', { type: 'button', className: 'btn', onClick: onReload }, t.reload),
      h('button', { type: 'button', className: 'txt-link eb-copy', onClick: onCopy }, copied ? t.copied : t.copy),
    ),
  )
}

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, copied: false } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { try { console.error('ErrorBoundary caught', error) } catch { /* no console */ } }
  copy = async () => {
    try { await navigator.clipboard?.writeText(errorDetails(this.state.error)); this.setState({ copied: true }) } catch { /* clipboard blocked */ }
  }
  reload = () => { try { location.reload() } catch { /* no window */ } }
  render() {
    if (!this.state.error) return this.props.children
    return h(FallbackCard, { lang: readLang(), error: this.state.error, copied: this.state.copied, onReload: this.reload, onCopy: this.copy })
  }
}

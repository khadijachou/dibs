// What's new, newest first: one block per release (v = the version pill; news_2 has none, its date is the header).
// Add one line here and its news_N string per release; a news_N holds one item per line ("\n"), same count in en/fr/es.
// Plain JS (no JSX) so node --test can load it; components/LegalText.jsx shows it, lib/newsSeen.js reads it.
// Optional on a release: big: true (important news: a dot on More and a bell on More > What's new until it is opened)
// and sum: the i18n key of a one-line summary shown on that row ({n} in it comes from the entry's n).
// Optional too: sheet, which drives the one-time big-update sheet (components/WhatsNewSheet.jsx, lib/bigUpdate.js), shown
// once when the app reaches a newer release that carries it. It is separate from `big` (which only lights the More dot).
//   sheet: up to three rows, each { icon, title, line, go? }:
//     icon  a name from the Icon set in components/ui.jsx (gift, bulb, play, shield, bag, ...)
//     title i18n key, about 24 characters; line i18n key, about 50 characters (en, fr and es, no em dash, no "!" but "Dibs!")
//     go    optional route name ('catalog', 'stake', ...) that adds a "Show me" link opening that screen
//   Write only things that are in the same release's What's new block. No `sheet` on a release = no sheet for it.
export const NEWS = [
  { date: '2026-11-15', key: 'news_36', v: '1.2.9' },
  { date: '2026-11-15', key: 'news_35', v: '1.2.8' },
  { date: '2026-11-15', key: 'news_34', v: '1.2.7' },
  { date: '2026-11-15', key: 'news_33', v: '1.2.6' },
  { date: '2026-11-15', key: 'news_32', v: '1.2.5' },
  { date: '2026-11-14', key: 'news_31', v: '1.2.4' },
  { date: '2026-11-14', key: 'news_30', v: '1.2.3' },
  { date: '2026-11-14', key: 'news_29', v: '1.2.2' },
  { date: '2026-11-14', key: 'news_28', v: '1.2.1' },
  { date: '2026-11-14', key: 'news_27', v: '1.2', big: true, sum: 'news_sum_27' },
  { date: '2026-11-13', key: 'news_26', v: '1.1.13' },
  { date: '2026-11-13', key: 'news_25', v: '1.1.12' },
  { date: '2026-11-13', key: 'news_24', v: '1.1.11' },
  { date: '2026-11-13', key: 'news_23', v: '1.1.10' },
  { date: '2026-11-13', key: 'news_22', v: '1.1.9', big: true, sum: 'news_sum_22' },
  { date: '2026-11-13', key: 'news_21', v: '1.1.8' },
  { date: '2026-11-13', key: 'news_20', v: '1.1.7' },
  { date: '2026-11-13', key: 'news_19', v: '1.1.6' },
  { date: '2026-11-13', key: 'news_18', v: '1.1.5' },
  { date: '2026-11-13', key: 'news_17', v: '1.1.4' },
  { date: '2026-11-13', key: 'news_16', v: '1.1.3' },
  { date: '2026-11-13', key: 'news_15', v: '1.1.2' },
  { date: '2026-11-13', key: 'news_14', v: '1.1.1' },
  { date: '2026-11-13', key: 'news_13', v: '1.1', big: true, sum: 'news_sum_13', n: 5 },
  { date: '2026-11-12', key: 'news_12', v: '1.0.10' },
  { date: '2026-11-12', key: 'news_11', v: '1.0.9' },
  { date: '2026-11-12', key: 'news_9', v: '1.0.8' },
  { date: '2026-11-12', key: 'news_8', v: '1.0.7' },
  { date: '2026-11-12', key: 'news_7', v: '1.0.6' },
  { date: '2026-11-12', key: 'news_10', v: '1.0.5' },
  { date: '2026-11-12', key: 'news_6', v: '1.0.4' },
  { date: '2026-11-12', key: 'news_5', v: '1.0.3' },
  { date: '2026-11-11', key: 'news_4', v: '1.0.2' },
  { date: '2026-11-11', key: 'news_3', v: '1.0.1' },
  { date: '2026-11-10', key: 'news_1', v: '1.0' },
  { date: '2026-11-09', key: 'news_2' },
]

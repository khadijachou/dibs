// What's new, newest first: one block per release (v = the version pill; news_2 has none, its date is the header).
// Add one line here and its news_N string per release; a news_N holds one item per line ("\n"), same count in en/fr/es.
// Plain JS (no JSX) so node --test can load it; components/LegalText.jsx shows it, lib/newsSeen.js reads it.
// Optional on a release: big: true (important news: a dot on More and a bell on More > What's new until it is opened)
// and sum: the i18n key of a one-line summary shown on that row ({n} in it comes from the entry's n).
export const NEWS = [
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

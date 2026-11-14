// v1.2.0 strings: every new daily-quest, weekly-quest, badge and What's new key exists in en, fr and es with the same
// {placeholders}, no em dash and no stray "!".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeT } from './i18n.js'

const T = { en: makeT('en'), fr: makeT('fr'), es: makeT('es') }
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

const KEYS = [
  'quest_meta', 'quest_done', 'quest_done_toast', 'quest_two', 'quest_two_text', 'quest_two_btn', 'quest_days5', 'quest_days5_text',
  'today', 'count', 'footer', 'day_done', 'xp_today', 'next_quests', 'quest_strip', 'quest_strip_done',
  'dq_checkin', 'dq_savings', 'dq_catalog', 'dq_category', 'dq_goal', 'dq_history', 'dq_badges', 'dq_add',
  'xp_r_daily', 'xp_r_dayfull', 'badge_g_quest',
  'badge_dayone', 'badge_dayone_how', 'badge_days7', 'badge_days7_how', 'badge_quests50', 'badge_quests50_how',
  'news_27', 'news_sum_27',
]

test('every new v1.2.0 key is in en, fr and es with the same placeholders, no em dash, no "!"', () => {
  for (const k of KEYS) {
    const en = T.en(k)
    assert.ok(en && en !== k, `en missing ${k}`)
    const p = ph(en)
    for (const l of ['fr', 'es']) {
      const v = T[l](k)
      assert.ok(v && v !== k, `${l} missing ${k}`)
      assert.deepEqual(ph(v), p, `${k} ${l} placeholders`)
      assert.ok(!v.includes('—'), `${k} ${l} em dash`)
      assert.ok(!v.includes('!'), `${k} ${l} "!"`)
    }
    assert.ok(!en.includes('—') && !en.includes('!'), `${k} en`)
  }
})

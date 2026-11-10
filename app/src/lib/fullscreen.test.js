import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFullscreen } from './fullscreen.js'

function fakeDoc() {
  const classes = new Set()
  const events = {}
  return {
    classes,
    visibilityState: 'visible',
    documentElement: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    addEventListener: (type, fn) => { events[type] = fn },
    fire: (type) => events[type]?.(),
  }
}

test('unsupported host: supported stays false and requestFullscreen is never called', async () => {
  let requested = 0
  const doc = fakeDoc()
  const fs = createFullscreen({
    getFullscreen: () => Promise.reject(new Error('getFullscreen is unavailable')),
    requestFullscreen: async () => { requested++ },
    exitFullscreen: async () => {},
    onFullscreenChange: () => { throw new Error('onFullscreenChange is unavailable') },
  }, doc)
  await fs.start()
  assert.deepEqual(fs.get(), { supported: false, on: false })
  assert.equal(await fs.enter(), false)
  assert.equal(requested, 0)
  assert.equal(doc.classes.has('is-fullscreen'), false)
})

test('supported host: the class follows onFullscreenChange, enter and leave', async () => {
  let hostOn = false
  let listener = null
  let notified = 0
  const doc = fakeDoc()
  const fs = createFullscreen({
    getFullscreen: async () => hostOn,
    requestFullscreen: async () => { hostOn = true },
    exitFullscreen: async () => { hostOn = false },
    onFullscreenChange: (fn) => { listener = fn; return () => { listener = null } },
  }, doc)
  fs.subscribe(() => notified++)
  await fs.start()
  assert.deepEqual(fs.get(), { supported: true, on: false })
  assert.equal(typeof listener, 'function')

  listener(true)
  assert.equal(fs.get().on, true)
  assert.equal(doc.classes.has('is-fullscreen'), true)
  listener(false) // native exit button or Android Back
  assert.equal(doc.classes.has('is-fullscreen'), false)

  assert.equal(await fs.enter(), true)
  assert.equal(doc.classes.has('is-fullscreen'), true)
  assert.equal(await fs.leave(), true)
  assert.equal(doc.classes.has('is-fullscreen'), false)

  // Back from the background: full screen ended while hidden, read it again.
  listener(true)
  hostOn = false
  doc.fire('visibilitychange')
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(fs.get().on, false)
  assert.equal(doc.classes.has('is-fullscreen'), false)
  assert.ok(notified >= 6)
})

test('a refused request reports false and leaves the class off', async () => {
  const doc = fakeDoc()
  const fs = createFullscreen({
    getFullscreen: async () => false,
    requestFullscreen: () => Promise.reject(new Error('busy')),
    exitFullscreen: async () => {},
    onFullscreenChange: () => () => {},
  }, doc)
  await fs.start()
  assert.equal(await fs.enter(), false)
  assert.equal(doc.classes.has('is-fullscreen'), false)
})

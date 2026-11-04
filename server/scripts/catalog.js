// Dibs catalogue tool. Runs on your PC only; never exposed by the server.
//
//   npm run catalog -- search amazon            search Bitrefill (US by default)
//   npm run catalog -- search amazon FR         search in another country
//   npm run catalog -- show amazon_com-usa      packages, prices, Lightning support
//   npm run catalog -- add amazon_com-usa 10,25 "Amazon gift card"
//   npm run catalog -- list                     what Dibs sells today
//   npm run catalog -- remove amazon_com-usa-10
//
// "add" checks each product first: in stock, payable over Lightning, no phone number or
// account needed, and the amount exists. The server reads catalog.json on every request,
// so new items show in the app after a page reload.
import { readFile, writeFile } from 'node:fs/promises'
import { bitrefillEnabled, getProduct, searchProducts } from '../src/bitrefill.js'

const FILE = new URL('../catalog.json', import.meta.url)
const [cmd, ...args] = process.argv.slice(2)

const ICONS = [
  [['games', 'game-stores', 'in-game-currencies', 'game-top-ups'], 'game'],
  [['music'], 'music'],
  [['streaming', 'entertainment'], 'play'],
  [['food', 'food-delivery', 'restaurants', 'groceries'], 'food'],
  [['esim', 'data', 'refill', 'bundles', 'phone'], 'signal'],
  [['online-marketplaces', 'retail', 'department-stores', 'electronics', 'apparel'], 'bag'],
  [['travel', 'flights', 'accommodation', 'transportation'], 'travel'],
]
const iconFor = (cats) => ICONS.find(([list]) => cats.some((c) => list.includes(c)))?.[1] || 'gift'

const load = async () => JSON.parse(await readFile(FILE, 'utf8'))
const save = async (items) => writeFile(FILE, JSON.stringify(items, null, 2) + '\n')

function table(rows, cols) {
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)))
  const line = (vals) => vals.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ')
  console.log(line(cols))
  console.log(w.map((n) => '-'.repeat(n)).join('  '))
  rows.forEach((r) => console.log(line(cols.map((c) => r[c]))))
}

async function main() {
  if (!['list', 'remove'].includes(cmd) && !bitrefillEnabled()) {
    throw new Error('Bitrefill is off: fill BITREFILL_CLIENT_ID and BITREFILL_CLIENT_SECRET in server/.env')
  }

  if (cmd === 'search') {
    const [query, country = 'US'] = args
    if (!query) throw new Error('Usage: npm run catalog -- search <brand> [COUNTRY]')
    const res = await searchProducts({ query, country: country.toUpperCase() })
    if (!res.length) return console.log('No product found.')
    table(res.map((p) => ({ slug: p.slug, name: p.name, type: p.type, currency: p.currency, 'in stock': p.inStock ? 'yes' : 'no' })), ['slug', 'name', 'type', 'currency', 'in stock'])
    console.log('\nNext: npm run catalog -- show <slug>')
    return
  }

  if (cmd === 'show') {
    const [slug] = args
    if (!slug) throw new Error('Usage: npm run catalog -- show <slug>')
    const p = await getProduct(slug)
    console.log(`${p.name} (${slug})  country ${p.country}  in stock ${p.inStock ? 'yes' : 'no'}`)
    console.log(`Lightning: ${p.lightning ? 'yes' : 'NO'}   recipient needed: ${p.recipientType}   categories: ${p.categories.join(', ')}`)
    if (!p.packages.length) return console.log('No fixed amounts: this product uses a custom range, Dibs cannot list it yet.')
    table(p.packages.map((k) => ({ amount: `${k.value} ${k.currency}`, 'you pay': `${k.price} ${k.priceCurrency}` })), ['amount', 'you pay'])
    const sep = p.packages.some((k) => k.value.includes(',')) ? '|' : ','
    console.log(`\nNext: npm run catalog -- add ${slug} "${p.packages.slice(-2).map((k) => k.value).join(sep)}" "<display name>"`)
    return
  }

  if (cmd === 'add') {
    const [slug, values, name] = args
    if (!slug || !values) throw new Error('Usage: npm run catalog -- add <slug> <amount,amount> "<display name>"')
    const p = await getProduct(slug)
    if (!p.inStock) throw new Error(`${slug} is out of stock`)
    if (!p.lightning) throw new Error(`${slug} cannot be paid over Lightning`)
    if (p.recipientType !== 'none') throw new Error(`${slug} needs a ${p.recipientType} (phone or account). Dibs does not support that yet.`)
    const items = await load()
    const added = []
    // Amounts are split on "|" or ","; an eSIM plan like "1GB, 7 Days" contains a comma, so a value
    // that matches a package exactly is kept whole.
    const wanted = p.packages.some((k) => k.value === values.trim())
      ? [values.trim()]
      : values.split(values.includes('|') ? '|' : ',').map((x) => x.trim()).filter(Boolean)
    for (const v of wanted) {
      const pkg = p.packages.find((k) => k.value === v)
      if (!pkg) { console.log(`skip ${v}: not an amount of ${slug} (see: npm run catalog -- show ${slug})`); continue }
      const id = `${slug}-${v}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+$/, '')
      if (items.some((i) => i.id === id)) { console.log(`skip ${id}: already in the catalogue`); continue }
      const detail = /^\d+(\.\d+)?$/.test(v) ? `${v} ${pkg.currency}` : v
      const item = { id, slug, packageValue: v, name: name || p.name, detail, icon: iconFor(p.categories), fallbackUsd: pkg.price }
      items.push(item)
      added.push(item)
    }
    await save(items)
    if (added.length) table(added.map((i) => ({ id: i.id, name: i.name, detail: i.detail, price: `${i.fallbackUsd} USD` })), ['id', 'name', 'detail', 'price'])
    console.log(`\n${added.length} item(s) added. Reload the app to see them.`)
    return
  }

  if (cmd === 'list') {
    const items = await load()
    table(items.map((i) => ({ id: i.id, name: i.name, detail: i.detail, slug: i.slug, enabled: i.enabled === false ? 'no' : 'yes' })), ['id', 'name', 'detail', 'slug', 'enabled'])
    return
  }

  if (cmd === 'remove') {
    const [id] = args
    const items = await load()
    const next = items.filter((i) => i.id !== id)
    if (next.length === items.length) throw new Error(`No item with id ${id} (see: npm run catalog -- list)`)
    await save(next)
    console.log(`Removed ${id}.`)
    return
  }

  console.log('Commands: search <brand> [COUNTRY] | show <slug> | add <slug> <amounts> "<name>" | list | remove <id>')
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1) })

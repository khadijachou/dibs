// Dibs catalogue tool. Runs on your PC only; never exposed by the server.
//
//   npm run catalog -- search amazon            search Bitrefill (US by default)
//   npm run catalog -- search amazon FR         search in another country
//   npm run catalog -- show amazon_com-usa      packages, prices, Lightning support
//   npm run catalog -- add amazon_com-usa 10,25 "Amazon gift card"
//   npm run catalog -- add amazon-uk all "Amazon gift card"   every value Dibs may sell (see below)
//   npm run catalog -- list                     what Dibs sells today, by brand and version
//   npm run catalog -- remove amazon_com-usa-10
//
// "add" checks each product first: in stock, payable over Lightning, no phone number or
// account needed, a version Dibs sells (USA, Europe, UK, Nigeria: src/catalogRules.js), and the amount exists.
// Values: paid in USD, payment price 100 USD or less; "all" keeps at most 8 per product (largest dropped first).
// Every item gets region, currency and worksWith ({ en, fr, es }: which accounts the card works with). Items of
// a product already in the catalogue reuse its worksWith; a new product asks for the three lines (the shop's
// own note is shown when it has one). The server reads catalog.json on every request, so new items show in the
// app after a page reload.
import { readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { bitrefillEnabled, getProduct, searchProducts } from '../src/bitrefill.js'
import { MAX_USD, MAX_VALUES, REGIONS, detailOf, itemId, keptPackages, regionOf, validWorksWith } from '../src/catalogRules.js'

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
    console.log(`Version: ${regionOf(p)?.region || `none (Dibs sells ${REGIONS.join(', ')} only)`}   shop note: ${p.note || '-'}`)
    if (!p.packages.length) return console.log('No fixed amounts: this product uses a custom range, Dibs cannot list it yet.')
    table(p.packages.map((k) => ({ amount: `${k.value} ${k.currency}`, 'you pay': `${k.price} ${k.priceCurrency}` })), ['amount', 'you pay'])
    const sep = p.packages.some((k) => k.value.includes(',')) ? '|' : ','
    console.log(`\nNext: npm run catalog -- add ${slug} "${p.packages.slice(-2).map((k) => k.value).join(sep)}" "<display name>"`)
    return
  }

  if (cmd === 'add') {
    const [slug, values, name] = args
    if (!slug || !values) throw new Error('Usage: npm run catalog -- add <slug> <amount,amount | all> "<display name>"')
    const p = await getProduct(slug)
    if (!p.inStock) throw new Error(`${slug} is out of stock`)
    if (!p.lightning) throw new Error(`${slug} cannot be paid over Lightning`)
    if (p.recipientType !== 'none') throw new Error(`${slug} needs a ${p.recipientType} (phone or account). Dibs does not support that yet.`)
    if (!p.packages.length) throw new Error(`${slug} has no fixed amounts (custom range only). Dibs cannot list it.`)
    const version = regionOf(p)
    if (!version) throw new Error(`${slug} is a ${p.country} ${p.currency} card. Dibs sells ${REGIONS.join(', ')} versions only.`)
    const items = await load()
    const own = items.filter((i) => i.slug === slug)
    const added = []
    let wanted
    if (values.trim().toLowerCase() === 'all') {
      wanted = keptPackages(p.packages).map((k) => k.value)
      const over = p.packages.length - wanted.length
      if (over > 0) console.log(`${over} value(s) left out: paid in another currency, above ${MAX_USD} USD, or past ${MAX_VALUES} per product.`)
    } else {
      // Amounts are split on "|" or ","; an eSIM plan like "1GB, 7 Days" contains a comma, so a value
      // that matches a package exactly is kept whole.
      wanted = p.packages.some((k) => k.value === values.trim())
        ? [values.trim()]
        : values.split(values.includes('|') ? '|' : ',').map((x) => x.trim()).filter(Boolean)
    }
    wanted = wanted.filter((v) => {
      const pkg = p.packages.find((k) => k.value === v)
      if (!pkg) { console.log(`skip ${v}: not an amount of ${slug} (see: npm run catalog -- show ${slug})`); return false }
      if (pkg.priceCurrency !== 'USD' || !(pkg.price <= MAX_USD)) { console.log(`skip ${v}: costs ${pkg.price} ${pkg.priceCurrency} (Dibs sells values up to ${MAX_USD} USD)`); return false }
      if (own.some((i) => i.packageValue === v) || items.some((i) => i.id === itemId(slug, v))) { console.log(`skip ${v}: already in the catalogue`); return false }
      return true
    })
    if (!wanted.length) return console.log('\nNothing to add.')
    // Every item of a product shares the same works-with line.
    const worksWith = own.find((i) => validWorksWith(i.worksWith))?.worksWith || await askWorksWith(p)
    for (const v of wanted) {
      const pkg = p.packages.find((k) => k.value === v)
      const item = {
        id: itemId(slug, v), slug, packageValue: v, name: name || own[0]?.name || p.name, detail: detailOf(v, pkg.currency),
        icon: own[0]?.icon || iconFor(p.categories), fallbackUsd: pkg.price, region: version.region, currency: version.currency, worksWith,
      }
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
    // By brand (the display name without "gift card"), then version in the app's order, then value.
    const groups = new Map()
    for (const i of items) {
      const brand = i.name.replace(/ gift card$/i, '')
      const k = `${brand}\u0000${i.region || '?'}`
      if (!groups.has(k)) groups.set(k, { brand, region: i.region || '?', items: [] })
      groups.get(k).items.push(i)
    }
    const rank = (r) => { const n = REGIONS.indexOf(r); return n < 0 ? 9 : n }
    const sorted = [...groups.values()].sort((a, b) => a.brand.localeCompare(b.brand) || rank(a.region) - rank(b.region))
    for (const g of sorted) {
      const vals = g.items.slice().sort((a, b) => Number(a.packageValue) - Number(b.packageValue) || String(a.packageValue).localeCompare(b.packageValue))
      const slugs = [...new Set(vals.map((i) => i.slug))].join(', ')
      console.log(`${g.brand} · ${g.region} (${slugs}, ${vals[0].currency || '?'})`)
      console.log(`  ${vals.map((i) => `${i.packageValue}${i.enabled === false ? ' (off)' : ''}`).join(', ')}`)
      console.log(`  works with: ${vals[0].worksWith?.en || '-'}`)
    }
    console.log(`\n${items.length} items, ${new Set(items.map((i) => i.slug)).size} products, ${groups.size} brand versions.`)
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

  console.log('Commands: search <brand> [COUNTRY] | show <slug> | add <slug> <amounts|all> "<name>" | list | remove <id>')
}

// Which accounts a new product's card works with, in the three languages. Short, plain words, no em dash, no "!".
// Example: "For Steam accounts with a USD wallet" / "Pour les comptes Steam avec un portefeuille en USD" /
// "Para cuentas de Steam con billetera en USD".
async function askWorksWith(p) {
  if (!process.stdin.isTTY) throw new Error(`${p.slug} is a new product: run this in a terminal to type its works-with line.`)
  console.log(`\nWhich accounts does ${p.name} work with? Shop note: ${p.note || '(none, check bitrefill.com)'}`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const w = {
      en: (await rl.question('  en (e.g. For Steam accounts with a USD wallet): ')).trim(),
      fr: (await rl.question('  fr (Quebec, vous): ')).trim(),
      es: (await rl.question('  es (neutral, tú): ')).trim(),
    }
    if (!validWorksWith(w)) throw new Error('Three lines are needed, with no em dash and no "!".')
    return w
  } finally {
    rl.close()
  }
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1) })

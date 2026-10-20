// 152 · stavba · 1.8.0 (spec § 2.19): meta.description a meta.whenToUse obou bloků A1 mají nejvýš 40 slov a kolečko má fázi Dluh.
import fs from 'node:fs'
import path from 'node:path'
import { argsStavby, kontrola } from '../stuby.mjs'
import { BLOKY } from '../harness.mjs'

const slova = t => String(t || '').trim().split(/\s+/).filter(Boolean).length
const pole = (src, klic) => { const m = new RegExp(`^\\s*${klic}: '((?:[^'\\\\]|\\\\.)*)'`, 'm').exec(src); return m ? m[1] : null }

export default {
  nazev: 'meta popisy bloků do 40 slov',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const b of ['blok-stavby', 'blok-kolecko']) {
      const src = fs.readFileSync(path.join(BLOKY, `${b}.js`), 'utf8')
      for (const klic of ['description', 'whenToUse']) {
        const t = pole(src, klic)
        k.ok(t != null, `${b}: meta.${klic} nenalezeno`)
        if (t != null) k.ok(slova(t) <= 40, `${b}: meta.${klic} má ${slova(t)} slov (strop 40)`)
      }
      if (b === 'blok-kolecko') k.ok(/title: 'Dluh'/.test(src), 'kolečko bez fáze Dluh v meta.phases')
    }
    return k.chyby
  },
}

// 203d · kolečko · 1.10.0 (review N16): rozdělení vrátí 11 oblastí; blok je sloučí po sousedech do 8 skupin (žádná se nezahodí)
// a sloučení zaloguje. Oblast se 45 cestami jde do zadání 40 cestami a „a dalších 5“ s pokynem dohledat je z gitu.
import { argsKolecko, kontrola } from '../stuby.mjs'

const OBLASTI = Array.from({ length: 11 }, (_, i) => ({ nazev: `o${i + 1}`, cesty: i === 0 ? Array.from({ length: 45 }, (_, j) => `apps/o1/m${j + 1}`) : [`apps/o${i + 1}`] }))

export default {
  nazev: 'kolečko: oblasti nad strop se sloučí, cesty nad 40 počtem',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'oblasti:kolečko') return { oblasti: OBLASTI }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const rs = k.pocet(/^review:kolečko:1:\d+$/, 8, 'osm reviewerů')
    for (const o of OBLASTI) k.ok(rs.some(r => new RegExp(`„(?:[^“]* \\+ )?${o.nazev}(?: \\+ [^“]*)?“`).test(r.prompt)), `oblast ${o.nazev} v názvu skupiny některého reviewera`)
    k.ok(rs.some(r => / \+ /.test(r.prompt)), 'sloučená skupina v názvu')
    const r1 = rs.find(r => r.prompt.includes('apps/o1/m1'))
    k.obsahuje(r1, 'a dalších', 'zbylé cesty počtem'); k.obsahuje(r1, 'git diff --name-only main...HEAD', 'pokyn dohledat cesty z gitu')
    k.neobsahuje(r1, 'apps/o1/m45', 'cesta nad 40 v zadání')
    k.ok(logy.some(l => l.includes('rozdělení vrátilo 11 oblastí, sloučeno do 8 skupin')), 'log sloučení')
    k.ok(logy.some(l => l.includes('apps/o1/m45')), 'log se všemi cestami oblasti')
    k.ok(logy.some(l => l.includes('rozdělení nevrátilo vsechny_adresare, pokrytí oblastí nejde ověřit')), 'log bez vsechny_adresare')
    return k.chyby
  },
}

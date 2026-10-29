// 204b · kolečko · 1.10.0 (review N15, plan-check N7): radek je ve schématu sběru povinný. Várka 2 vrátí tutéž položku s jiným id
// a bez řádku: blok ji vyřadí podle normalizovaného textu, další fix se nespustí a položka se nepřeškrtne dvakrát.
import { argsKolecko, kontrola } from '../stuby.mjs'

const P1 = '[řez 03 · admin] [oprava] apps/a.ts: chybí validace DLUH-204B'

export default {
  nazev: 'kolečko: várka dluhu vyřadí položku dřívější várky podle textu',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'dluh:kolečko') return { celkem: 1, balicky: [{ soubory: ['apps/a.ts'], polozky: [{ id: 'D1', text: P1, radek: 7 }] }] }
    if (label === 'dluh:kolečko:2') return { celkem: 1, balicky: [{ soubory: ['apps/a.ts'], polozky: [{ id: 'D2', text: `  ${P1.toUpperCase()} ` }] }] }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', dluh: { polozek: 1, opraveno: 1, odmitnuto: 0, uz_vyreseno: 0, varek: 1 } })
    const sb = k.jeden('dluh:kolečko')
    const req = sb && sb.schema.properties.balicky.items.properties.polozky.items.required
    k.ok(Array.isArray(req) && req.includes('radek'), `radek povinný ve schématu sběru: ${JSON.stringify(req)}`)
    k.nic(/^fix:kolečko:dluh 2:/, 'fix nad položkou dřívější várky')
    k.ok(logy.some(l => /1 položek vzatých v dřívější várce/.test(l)), 'log vyřazení')
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, `VYŘEŠENO <dnešní datum>: kolečko (hledej je podle textu): [${JSON.stringify(P1)}]`, 'mezi opravenými položka jen jednou')
    k.neobsahuje(z, 'VYŘEŠENO dříve (ověřilo kolečko)', 'druhé přeškrtnutí téže položky')
    return k.chyby
  },
}

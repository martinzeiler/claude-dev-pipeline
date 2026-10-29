// 205 · kolečko · 1.10.0 (spec E3, kontrakt 6): fix vlny dluhu ověří položku jako už vyřešenou (uz_vyreseno_ids). Závěr ji přeškrtne
// tvarem „VYŘEŠENO dříve (ověřilo kolečko)“ odděleně od opravených a počty dluhu ji vedou zvlášť; vyřízená várka pustí další sběr.
import { argsKolecko, kontrola, oprava } from '../stuby.mjs'

const P1 = '[řez 05 · api] [oprava] apps/a.ts: duplicitní helper DLUH-205-1'
const P2 = '[řez 06 · api] [oprava] apps/a.ts: stav brány v čase DLUH-205-2'

export default {
  nazev: 'kolečko: položka dluhu už vyřešená, závěr ji přeškrtne',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'dluh:kolečko') return { celkem: 2, balicky: [{ soubory: ['apps/a.ts'], polozky: [{ id: 'D1', text: P1, radek: 3 }, { id: 'D2', text: P2, radek: 4 }] }] }
    if (label === 'fix:kolečko:dluh:1') return oprava({ opravene_ids: ['D1'], uz_vyreseno_ids: ['D2'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', dluh: { polozek: 2, opraveno: 1, odmitnuto: 0, uz_vyreseno: 1, varek: 1 } })
    const f = k.jeden('fix:kolečko:dluh:1')
    k.pole(f, ['uz_vyreseno_ids'], 'fix dluhu'); k.obsahuje(f, 'vrať v uz_vyreseno_ids', 'pokyn k už vyřešeným')
    k.jeden('dluh:kolečko:2')
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, 'VYŘEŠENO dříve (ověřilo kolečko)', 'tvar přeškrtnutí už vyřešených'); k.obsahuje(z, 'DLUH-205-2')
    k.obsahuje(z, 'VYŘEŠENO <dnešní datum>: kolečko (hledej je podle textu): ["[řez 05 · api] [oprava] apps/a.ts: duplicitní helper DLUH-205-1"]', 'mezi opravenými jen opravená')
    return k.chyby
  },
}

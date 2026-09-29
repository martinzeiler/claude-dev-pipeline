// 13 · stavba · E2E se 30 kritérii v sekcích 10/10/5/5 (§ 1.7): hladové seskupení do ≤ 12 dá [Alfa] [Beta] [Gama, Delta],
// tedy tři souběžní verifikátoři a, b, c s písmenem v labelu, reportu i prefixu dat; mergeE2E sečte všechny tři.
import { argsStavby, kontrola, parsujLabel, e2ePass, CWD } from '../stuby.mjs'

const SEKCE = [{ nazev: 'Sekce Alfa', kriterii: 10 }, { nazev: 'Sekce Beta', kriterii: 10 }, { nazev: 'Sekce Gama', kriterii: 5 }, { nazev: 'Sekce Delta', kriterii: 5 }]
const SKUPINY = { a: ['Sekce Alfa'], b: ['Sekce Beta'], c: ['Sekce Gama', 'Sekce Delta'] }

export default {
  nazev: 'E2E 30 kritérií v sekcích 10/10/5/5',
  blok: 'blok-stavby',
  args: argsStavby({ kriteria: 30, e2e_sekce: SEKCE }),
  odpoved(label) {
    const l = parsujLabel(label)
    if (l.typ === 'e2e' && l.pismeno) return e2ePass(10, { report_path: `${CWD}/docs/reviews/rez-05-p1-e2e-${l.pismeno}-kolo-1.md` })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^e2e:řez 05:1(:|$)/, 3, 'verifikátoři kola 1')
    const e = Object.fromEntries(Object.keys(SKUPINY).map(p => [p, k.jeden(`e2e:řez 05:1:${p}`)]))
    k.vsechnySoubezne(Object.values(e), 'verifikátoři a, b, c')
    for (const [p, sekce] of Object.entries(SKUPINY)) {
      for (const s of SEKCE.map(x => x.nazev)) (sekce.includes(s) ? k.obsahuje : k.neobsahuje)(e[p], s)
      k.obsahuje(e[p], `[E2E-${p}]`, `prefix dat [E2E-${p}]`)
      k.obsahuje(e[p], `e2e-${p}`, `report verifikátoru ${p}`)
    }
    k.rovno(v && v.e2e && v.e2e.celkem, 30, 'návrat.e2e.celkem (součet tří verifikátorů)')
    return k.chyby
  },
}

// 71 · stavba · 1.5.0 (spec § 1.11): uzavření dostane seznamy celé, jen dlouhou položku oříznutou (600 znaků s „…“), nikdy celek
// uprostřed položky (běh web-podzim: follow-upy useknuté na 2 500 znaků, do follow-ups.md se dostala čtvrtina).
import { argsStavby, kontrola, stub } from '../stuby.mjs'

const FU = Array.from({ length: 30 }, (_, i) => `FU-71-${String(i).padStart(2, '0')} ${'x'.repeat(140)}`)
const DLOUHA = `DLOUHA-71 ${'y'.repeat(900)}`

export default {
  nazev: 'uzavření dostane celé seznamy',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'implement:řez 05:1') return stub(label, { follow_ups: [...FU, DLOUHA], odchylky_od_prd: Array.from({ length: 12 }, (_, i) => `ODCH-71-${i} ${'z'.repeat(150)}`) })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const c = k.jeden('uzavření:řez 05')
    k.obsahuje(c, 'FU-71-29', 'poslední follow-up (za 2 500 znaky)')
    k.obsahuje(c, 'ODCH-71-11', 'poslední odchylku (za 1 200 znaky)')
    k.obsahuje(c, 'DLOUHA-71', 'dlouhou položku')
    k.neobsahuje(c, 'y'.repeat(700), 'dlouhou položku neoříznutou')
    k.obsahuje(c, '…', 'značku oříznutí položky')
    return k.chyby
  },
}

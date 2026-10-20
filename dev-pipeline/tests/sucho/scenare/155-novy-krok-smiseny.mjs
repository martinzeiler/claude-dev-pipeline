// 155 · stavba · 1.8.0 (review N5): smíšený případ: fix vrátí kódovou opravu (AK2) a zároveň nový krok bez opory (AK5). Kód se nasadí
// normálně bez kroku, kolo 2 přeměří jen AK2 proti novému nasazení, AK5 jde majiteli jako otázka a pokus se kvůli němu nepočítá.
import { argsStavby, kontrola, e2ePass, oprava, hash } from '../stuby.mjs'

export default {
  nazev: 'nový krok bez opory vedle kódové opravy: nasazení bez kroku, kolo 2 jen nad AK2',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: [{ kriterium: 'AK2 Řazení seznamu', selhani: 'špatné pořadí' }, { kriterium: 'AK5 Rychlost detailu', selhani: 'LCP nad prahem' }] })
    if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['apps/sucho/seznam.ts: razeni'], novy_krok_po_nasazeni: [{ krok: 'KROK-155: vypnout HTTP/3', duvod: 'protokol padá', opora: '', kriterium: 'AK5 Rychlost detailu' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.jeden('verify:řez 05:e2e')
    const d = k.jeden('deploy:řez 05:2')
    k.neobsahuje(d, 'jen commitni, nic nenasazuj', 'degradaci na commit'); k.neobsahuje(d, 'KROK-155', 'krok bez opory v zadání deploye')
    const e2 = k.jeden('e2e:řez 05:2')
    k.obsahuje(e2, 'AK2 Řazení seznamu', 'kolo 2 nad AK2'); k.neobsahuje(e2, 'AK5', 'kolo 2 nad kritériem s krokem bez opory')
    k.obsahuje(e2, hash('deploy:řez 05:2#1'), 'kolo 2 proti novému nasazení')
    const r = (v && v.rozhodnuti || []).filter(x => x && typeof x === 'object' && x.typ === 'novy_krok')
    k.ok(r.length === 1 && r[0].kriterium === 'AK5 Rychlost detailu', `rozhodnuti typ novy_krok: ${JSON.stringify(r)}`)
    return k.chyby
  },
}

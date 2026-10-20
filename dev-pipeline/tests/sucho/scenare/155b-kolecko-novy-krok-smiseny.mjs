// 155b · kolečko · 1.8.0 (review N5): smíšený případ v kolečku: kódová oprava se nasadí bez kroku bez opory, kolo 2 přeměří jen AK2,
// AK5 jde majiteli jako otázka (rozhodnuti typ novy_krok) a kolečko doběhne hotovo.
import { argsKolecko, kontrola, e2ePass, oprava } from '../stuby.mjs'

export default {
  nazev: 'kolečko: nový krok bez opory vedle kódové opravy',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'e2e:kolečko:1') return e2ePass(5, { vysledek: 'fail', pass: 3, fail: 2, fail_kriteria: [{ kriterium: 'AK2 Řazení seznamu', selhani: 'špatné pořadí' }, { kriterium: 'AK5 Rychlost detailu', selhani: 'LCP nad prahem' }] })
    if (label === 'fix-e2e:kolečko:1') return oprava({ zmenena_mista: ['apps/sucho/seznam.ts: razeni'], novy_krok_po_nasazeni: [{ krok: 'KROK-155b: vypnout HTTP/3', duvod: 'protokol padá', opora: '', kriterium: 'AK5 Rychlost detailu' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', review_passed: true })
    k.jeden('verify:kolečko:oprava po E2E:1'); k.nic(/^commit:kolečko:oprava po E2E/, 'degradaci na commit')
    const d = k.jeden('deploy:kolečko:2'); k.neobsahuje(d, 'KROK-155b', 'krok bez opory v zadání deploye')
    const e2 = k.jeden('e2e:kolečko:2')
    k.obsahuje(e2, 'AK2 Řazení seznamu', 'kolo 2 nad AK2'); k.neobsahuje(e2, 'AK5', 'kolo 2 nad kritériem s krokem bez opory')
    const r = (v && v.rozhodnuti || []).filter(x => x && typeof x === 'object' && x.typ === 'novy_krok')
    k.ok(r.length === 1 && r[0].kriterium === 'AK5 Rychlost detailu', `rozhodnuti typ novy_krok: ${JSON.stringify(r)}`)
    return k.chyby
  },
}

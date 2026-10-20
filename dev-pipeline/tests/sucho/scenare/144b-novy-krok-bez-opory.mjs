// 144b · stavba · 1.8.0 (spec § 2.4, review N5): nový krok nad platformou bez opory v Povolení: krok se neprovede, kódová oprava se
// nasadí normálně bez něj, kritérium jde majiteli jako otázka (rozhodnuti typ novy_krok), kolo 2 se nad ním nekoná (jiné FAIL
// kritérium není), řez se uzavře hotovo a pokus se nepočítá.
import { argsStavby, kontrola, e2ePass, oprava } from '../stuby.mjs'

export default {
  nazev: 'nový krok bez opory: otázka majiteli, nasazení bez kroku, bez kola 2',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK2 Rychlost seznamu', selhani: 'LCP nad prahem' }] })
    if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['apps/sucho/sit.ts: nastaveni'], novy_krok_po_nasazeni: [{ krok: 'KROK-144b: vypnout HTTP/3', duvod: 'protokol padá', opora: '', kriterium: 'AK2 Rychlost seznamu' }] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.jeden('verify:řez 05:e2e')
    const d = k.jeden('deploy:řez 05:2')
    k.neobsahuje(d, 'jen commitni, nic nenasazuj', 'degradaci na commit'); k.neobsahuje(d, 'KROK-144b', 'krok bez opory v zadání deploye')
    k.nic(/^e2e:řez 05:2$/, 'kolo 2 nad kritériem s krokem mimo Povolení')
    const r = (v && v.rozhodnuti || []).filter(x => x && typeof x === 'object' && x.typ === 'novy_krok')
    k.ok(r.length === 1 && /KROK-144b/.test(r[0].krok) && r[0].kriterium === 'AK2 Rychlost seznamu', `rozhodnuti typ novy_krok: ${JSON.stringify(r)}`)
    k.ok(logy.some(l => /bez opory v Povolení/.test(l)), 'log o kroku bez opory')
    return k.chyby
  },
}

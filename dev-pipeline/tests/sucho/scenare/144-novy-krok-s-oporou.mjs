// 144 · stavba · 1.8.0 (spec § 2.4): oprava po E2E vyžaduje nový krok nad platformou s oporou v Povolení: krok jde do nasazení jako
// další krok (nasazení, ne commit-only) a kolo 2 přeměří FAIL kritérium.
import { argsStavby, kontrola, e2ePass, oprava } from '../stuby.mjs'

const KROK = { krok: 'KROK-144: vypnout HTTP/3 na platformě', duvod: 'protokol padá na měřicí službě', opora: 'P3: smíš měnit nastavení sítě na platformě', kriterium: 'AK2 Rychlost seznamu' }

export default {
  nazev: 'nový krok po nasazení s oporou jde do nasazení',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK2 Rychlost seznamu', selhani: 'LCP nad prahem' }] })
    if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['apps/sucho/sit.ts: nastaveni'], novy_krok_po_nasazeni: [KROK] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.pole(k.jeden('fix-e2e:řez 05:1'), ['novy_krok_po_nasazeni'], 'FIX')
    k.obsahuje(k.jeden('fix-e2e:řez 05:1'), 'novy_krok_po_nasazeni', 'pokyn k novému kroku')
    const d = k.jeden('deploy:řez 05:2')
    k.obsahuje(d, 'nový krok po nasazení s oporou v Povolení: KROK-144', 'nový krok v zadání deploye'); k.obsahuje(d, KROK.opora, 'citaci opory')
    k.neobsahuje(d, 'jen commitni, nic nenasazuj', 'commit-only u kroku s oporou')
    k.obsahuje(k.jeden('e2e:řez 05:2'), 'AK2 Rychlost seznamu', 'kolo 2 nad FAIL kritériem')
    k.ok(logy.some(l => /krok po nasazení s oporou v Povolení/.test(l)), 'log o kroku s oporou')
    return k.chyby
  },
}

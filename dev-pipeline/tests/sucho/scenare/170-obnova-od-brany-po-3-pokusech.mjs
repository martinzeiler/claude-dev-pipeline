// 170 · stavba · 1.9.0 (§ 1.1, § 9): obnova od brány v pokusu 3 po selhání všech tří pokusů na červené bráně. S cache původního běhu
// se vrátí celé pokusy 1 a 2 i diagnóza, implementace a review pokusu 3 (prefix shodný přes pokusy); první živé volání je obnova-stav,
// pak brána pokusu 3 se značkou (dnes zelená), deploy, E2E a uzavření. Výsledek hotovo na pokus 3.
import { argsStavby, kontrola, zelenaBrana, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-170'
const CERVENA = zelenaBrana({ selhalo: 1, exit_kod: 1, selhavajici: ['apps/sucho/pomaly.test.ts: timed out in 5000ms'] })

export default {
  nazev: 'obnova od brány po třech pokusech: pokusy 1–3 před bránou z cache',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 3 }),
  odpoved(label) {
    if (/^verify:řez 05:(p\d:)?[12]$/.test(label)) return CERVENA
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'brána', pokusy: 3 })
    k.jeden('diagnose:řez 05')
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 3, obnova: { od_faze: 'brana', znacka: Z, pokus: 3 } }), odpoved: () => null }, { cache: volani })
    k.ok(obnova.vysledek && obnova.vysledek.vysledek === 'hotovo' && obnova.vysledek.pokusy === 3, `obnova: ${JSON.stringify(obnova.vysledek && [obnova.vysledek.vysledek, obnova.vysledek.pokusy, obnova.vysledek.detail])}`)
    const zive = obnova.volani.filter(x => !x.z_cache)
    k.rovno(zive.map(x => x.label), ['obnova-stav:řez 05', 'verify:řez 05:p3:1', 'deploy:řez 05:p3:1', 'e2e:řez 05:p3:1', 'uzavření:řez 05'], 'živá volání obnovy')
    k.ok(obnova.volani.filter(x => x.z_cache).length === volani.length - 3, `z cache ${obnova.volani.filter(x => x.z_cache).length} volání, původní běh měl ${volani.length} (bez brány pokusu 3: verify 1, oprava, verify 2)`)
    k.ok(!obnova.volani.some(x => !x.z_cache && /^(implement|review|thermo|diagnose|fix-brana):/.test(x.label)), 'implementace, review, diagnóza ani oprava brány neběží živě')
    const b = zive.find(x => x.label === 'verify:řez 05:p3:1')
    k.obsahuje(b, Z, 'značku obnovy v bráně pokusu 3'); k.obsahuje(b, 'rez-05-p3-verify', 'report pokusu 3')
    k.neobsahuje(zive.find(x => x.label === 'obnova-stav:řez 05'), 'Obnova běhu', 'věta obnovy v obnova-stav')
    return k.chyby
  },
}

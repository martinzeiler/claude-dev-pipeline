// 143b · stavba · 1.8.0 (spec § 2.3, review N1): obnova s pokus 3 přehraje pokusy 1 a 2 (z cache) a před třetím pokusem jde diagnóza jako
// v původním běhu, bez značky; pokusy v návratu 3. Pokus nad stropem (max_pokusu 1, pokus 2) blok odmítne jako chybu args (N3).
// Od 1.10.0 přehrávání pokusů měří obnova od brány (od deploye jde obnova podle stavu); štítky pokusů 2 a 3 nesou :p2 a :p3.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-143b'
const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })

export default {
  nazev: 'obnova od pokusu 3 s diagnózou; pokus nad stropem je chyba',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'brana', znacka: Z, pokus: 3 } }),
  odpoved(label) {
    if (/^e2e:řez 05:(p2:)?[12]$/.test(label)) return FAIL
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 3 })
    k.jeden('implement:řez 05:3'); k.neobsahuje(k.jeden('diagnose:řez 05'), Z, 'značku v diagnóze'); k.neobsahuje(k.jeden('implement:řez 05:3'), Z, 'značku před bránou')
    k.obsahuje(k.jeden('verify:řez 05:p3:1'), Z, 'značku v bráně přerušeného pokusu 3')
    k.obsahuje(k.jeden('e2e:řez 05:p3:1'), Z, 'značku v E2E přerušeného pokusu 3')
    for (const x of k.s(/^(verify|deploy|e2e):řez 05:(p2:)?\d/)) k.neobsahuje(x, Z, 'značku v pokusech 1 a 2')
    const nad = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1, obnova: { od_faze: 'deploy', znacka: Z, pokus: 2 } }), odpoved: () => null })
    k.rovno(nad.vysledek && nad.vysledek.ok, false, 'pokus nad stropem: návrat.ok')
    k.ok(/nad stropem max_pokusu 1/.test(nad.vysledek && nad.vysledek.duvod || ''), `pokus nad stropem: duvod ${JSON.stringify(nad.vysledek && nad.vysledek.duvod)}`)
    k.ok(!nad.volani.length, 'pokus nad stropem nic nespustil')
    return k.chyby
  },
}

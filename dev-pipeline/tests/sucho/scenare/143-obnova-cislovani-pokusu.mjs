// 143 · stavba · 1.8.0 (spec § 2.3, review N1 a N2): obnova.pokus je číslo přerušeného pokusu. Pokusy před ním se přehrají se stejnými
// labely a prompty (v ostrém běhu z cache), v přerušeném pokusu dostanou značku jen fáze od od_faze a jeho reporty se dopíšou (p2);
// pokusy v návratu jsou absolutní. Od 1.10.0 jde obnova od deploye podle stavu (scénář 153), cache a číslování pokusů měří obnova od brány;
// štítky deploye, brány a E2E pokusu 2 nesou :p2.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'

const Z = 'ZNACKA-143'
const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })

export default {
  nazev: 'obnova pokračuje přerušeným pokusem 2',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'brana', znacka: Z, pokus: 2 } }),
  odpoved(label) {
    // Pokus 1 padne na E2E v obou kolech (v ostrém běhu z cache), pokus 2 projde.
    if (label === 'e2e:řez 05:1' || label === 'e2e:řez 05:2') return FAIL
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    for (const l of ['implement:řez 05:1', 'verify:řez 05:1', 'deploy:řez 05:1', 'implement:řez 05:2', 'review:řez 05:1']) for (const x of k.s(new RegExp(`^${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))) k.neobsahuje(x, Z, 'značku obnovy (pokus 1 celý a fáze pokusu 2 před bránou jdou z cache)')
    k.pocet(/^deploy:řez 05:1$/, 1, 'deploy pokusu 1'); k.pocet(/^deploy:řez 05:p2:1$/, 1, 'deploy přerušeného pokusu 2')
    const b2 = k.jeden('verify:řez 05:p2:1')
    k.obsahuje(b2, Z, 'značku v bráně přerušeného pokusu 2'); k.obsahuje(b2, 'rez-05-p2-verify', 'report pokusu 2')
    for (const l of ['deploy:řez 05:p2:1', 'e2e:řez 05:p2:1', 'uzavření:řez 05']) k.obsahuje(k.jeden(l), Z, 'značku od brány dál')
    k.nic(/^diagnose:/, 'diagnóza jen před třetím pokusem')
    return k.chyby
  },
}

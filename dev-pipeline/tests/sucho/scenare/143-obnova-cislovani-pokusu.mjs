// 143 · stavba · 1.8.0 (spec § 2.3, review N1 a N2): obnova.pokus je číslo přerušeného pokusu. Pokusy před ním se přehrají se stejnými
// labely a prompty (v ostrém běhu z cache), v přerušeném pokusu dostanou značku jen fáze od od_faze a jeho reporty se dopíšou (p2);
// pokusy v návratu jsou absolutní.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'

const Z = 'ZNACKA-143'
const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })

export default {
  nazev: 'obnova pokračuje přerušeným pokusem 2',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { od_faze: 'deploy', znacka: Z, pokus: 2 } }),
  odpoved(label, p, o, stav) {
    // Pokus 1 padne na E2E (v ostrém běhu z cache), pokus 2 projde.
    if (label === 'e2e:řez 05:1' && stav.pocty[label] === 1) return FAIL
    if (label === 'e2e:řez 05:2') return FAIL
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    for (const l of ['implement:řez 05:1', 'verify:řez 05:1', 'implement:řez 05:2', 'review:řez 05:1']) for (const x of k.s(new RegExp(`^${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))) k.neobsahuje(x, Z, 'značku obnovy (pokus 1 celý a fáze pokusu 2 před deployem jdou z cache)')
    const deploye = k.s(/^deploy:řez 05:1$/)
    k.ok(deploye.length === 2, `deploy:řez 05:1 má běžet v obou pokusech, běžel ${deploye.length}×`)
    if (deploye.length === 2) { k.neobsahuje(deploye[0], Z, 'značku v deployi pokusu 1'); k.obsahuje(deploye[1], Z, 'značku v deployi přerušeného pokusu 2') }
    k.obsahuje(k.s(/^verify:řez 05:1$/)[1], 'rez-05-p2-verify', 'report pokusu 2')
    k.obsahuje(k.jeden('uzavření:řez 05'), Z, 'značku v uzavření')
    k.nic(/^diagnose:/, 'diagnóza jen před třetím pokusem')
    return k.chyby
  },
}

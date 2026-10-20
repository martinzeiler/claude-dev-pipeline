// 154 · stavba · 1.8.0 (spec § 2.2, review N4): část vrátí prostredi v pokusu 1 a pokus padne na E2E; pokus 2 projde. Část prostředí
// ani části na ní závislé se znovu nestaví, položky prostředí přežijí pokus a jdou do rozhodnutí (i selhaného pokusu) a do uzavření.
import { argsStavby, casti, kontrola, stub, e2ePass } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })

export default {
  nazev: 'položky prostředí přežijí selhaný pokus',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K3'], ['K2', ['K3']]]), max_pokusu: 2 }),
  odpoved(label, p, o, stav) {
    if (label === 'implement:řez 05:část K3:1') return stub(label, { stav: 'prostredi', dukaz: 'DUKAZ-154: cizí služba vrací 503' })
    if (label === 'e2e:řez 05:1' && stav.pocty[label] === 1) return FAIL
    if (label === 'e2e:řez 05:2') return FAIL
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.nic(/^implement:řez 05:část K3:2|^implement:řez 05:část K2/, 'část prostředí ani závislá část se v pokusu 2 nestaví')
    const pr = (v && v.rozhodnuti || []).filter(x => x && typeof x === 'object' && x.typ === 'prostredi')
    k.ok(pr.length === 2 && pr.some(x => x.cast === 'část K3' && /DUKAZ-154/.test(x.dukaz)) && pr.some(x => x.cast === 'část K2'), `rozhodnuti prostředí pro K3 a K2: ${JSON.stringify(pr)}`)
    k.rovno(v && v.casti, [{ id: 'K1', hotovo: true }, { id: 'K3', hotovo: true, prostredi: true }, { id: 'K2', hotovo: false, prostredi: true }], 'návrat.casti')
    const uz = k.jeden('uzavření:řez 05')
    k.obsahuje(uz, 'PROSTŘEDÍ: <důkaz>'); k.obsahuje(uz, 'DUKAZ-154'); k.obsahuje(uz, 'část K2', 'závislá část v uzavření')
    return k.chyby
  },
}

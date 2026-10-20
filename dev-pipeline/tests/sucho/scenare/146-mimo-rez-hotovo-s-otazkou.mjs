// 146 · stavba · 1.8.0 (spec § 2.12): řez s posledním pokusem (max_pokusu 1), jehož všechna FAIL kritéria nesou doloženou příčinu mimo
// hranici řezu, se uzavře hotovo s otázkou (rozhodnuti typ mimo_rez) místo selhalo; oprava ani kolo 2 se nekonají.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'FAIL mimo hranici řezu v posledním pokusu: hotovo s otázkou',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 1 }),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK4 Studený start', selhani: 'první odpověď 6 s', pricina_mimo_rez: { dukaz: 'DUKAZ-146: studený start API mimo rozsah řezu' } }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.nic(/^(fix-e2e|e2e:řez 05:2)/, 'bez opravy a kola 2')
    const r = (v && v.rozhodnuti || []).filter(x => x && typeof x === 'object' && x.typ === 'mimo_rez')
    k.ok(r.length === 1 && r[0].kriterium === 'AK4 Studený start' && /DUKAZ-146/.test(r[0].dukaz), `rozhodnuti typ mimo_rez: ${JSON.stringify(r)}`)
    k.rovno(v && v.e2e && v.e2e.fail, 0, 'návrat.e2e.fail')
    k.obsahuje(k.jeden('uzavření:řez 05'), 'MIMO ŘEZ: <důkaz>', 'zápis stavu mimo řez')
    return k.chyby
  },
}

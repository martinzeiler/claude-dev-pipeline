// 220 · stavba · 1.11.0 (spec D4): klíč kritéria je značka, jinak celý text. Dřív vracel kId z „smoke: …“ jen předponu, jeden důkaz spároval dvě
// selhání a FAIL bez důkazu zmizel.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const fail = druhy => e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: [{ kriterium: 'smoke: Přehled', selhani: 'nenačte se', pricina_mimo_rez: { dukaz: 'výpadek CDN 12:00' } }, { kriterium: 'smoke: Export', selhani: '500', ...(druhy ? { pricina_mimo_rez: { dukaz: 'výpadek S3 12:05' } } : {}) }] })
const odpoved = druhy => l => /^e2e:řez 05:[12]$/.test(l) ? fail(druhy) : null

export default {
  nazev: 'jeden důkaz nespáruje dvě selhání smoke',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 1 }),
  odpoved: odpoved(false),
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'e2e' })
    k.jeden('fix-e2e:řez 05:1')
    const oba = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: odpoved(true) })
    k.ok(oba.vysledek && oba.vysledek.vysledek === 'hotovo' && oba.vysledek.rozhodnuti.filter(x => x.typ === 'mimo_rez').length === 2, `oba s důkazem: ${JSON.stringify(oba.vysledek && [oba.vysledek.vysledek, oba.vysledek.rozhodnuti])}`)
    return k.chyby
  },
}

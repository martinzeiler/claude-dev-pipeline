// 182 · stavba · 1.11.0 (spec F1, F2; obrací mez 300 ř. z 1.10.0): každá oprava kódu po E2E dostane před bránou jedno kolo code-review nad svým diffem;
// blokující nález opraví jedna dávka (poslední várka, zúžením), ostatní jdou do follow-ups. bez_review je jen pro review, které nevrátilo výsledek.
import { argsStavby, kontrola, stub, e2ePass, oprava, NIC } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK3 Automat výmazu', selhani: '500 na /zbytky' }] })
const odpoved = review => (label) => {
  if (label === 'e2e:řez 05:1') return FAIL
  if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['apps/sucho/automat.ts: spust'] })
  if (label === 'review:řez 05:oprava-e2e') return review
  return null
}

export default {
  nazev: 'každá oprava po E2E jde přes review, bez výsledku do bez_review',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: odpoved(stub('review:řez 05:oprava-e2e', { nalezu: 2, blokujicich: 1, balicky: [{ soubory: ['apps/sucho/automat.ts'], nalezy: ['N1'] }], follow_up_ids: ['N2'] })),
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const fe = k.jeden('fix-e2e:řez 05:1'), r = k.jeden('review:řez 05:oprava-e2e'), f = k.jeden('fix:řez 05:E2E.1'), b = k.jeden('verify:řez 05:e2e')
    k.ok(fe && !fe.klice.includes('radku_zmeneno') && !fe.klice.includes('nove_soubory'), 'FIX bez rozsahu opravy (mez je pryč)')
    k.pred(fe, r); k.pred(r, f); k.pred(f, b)
    k.obsahuje(r, 'VÝHRADNĚ změny opravy: apps/sucho/automat.ts: spust', 'rozsah review')
    k.obsahuje(f, 'Poslední várka', 'oprava zúžením'); k.obsahuje(f, 'N1', 'blokující nález')
    k.ok(!(v && v.bez_review && v.bez_review.length), `bez_review u zrevidované opravy: ${JSON.stringify(v && v.bez_review)}`)
    k.obsahuje(k.jeden('uzavření:řez 05'), 'N2 (FOLLOW-UP', 'FOLLOW-UP nález review opravy do follow-ups')
    const bezVysledku = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: odpoved(NIC) })
    const m = kontrola(bezVysledku.volani)
    const d2 = m.jeden('deploy:řez 05:2')
    const br = bezVysledku.vysledek && bezVysledku.vysledek.bez_review
    m.ok(Array.isArray(br) && br.length === 1 && d2 && br[0].commit === d2.odpoved.commit && /oprava po E2E \(pokus 1\) bez review: apps\/sucho\/automat\.ts: spust/.test(br[0].popis), `bez_review: ${JSON.stringify(br)}`)
    m.obsahuje(m.jeden('uzavření:řez 05'), '"bez_review":[{"commit"', 'bez_review v souboru výsledku')
    k.chyby.push(...m.chyby.map(x => `review bez výsledku: ${x}`))
    return k.chyby
  },
}

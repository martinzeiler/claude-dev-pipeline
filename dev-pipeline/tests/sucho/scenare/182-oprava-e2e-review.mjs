// 182 · stavba · 1.10.0 (spec C3; třída N2): oprava po E2E, která přidá soubor kódu nebo změní víc než ~300 řádků, dostane před bránou
// kolo code-review nad svým diffem; blokující nález opraví jedna dávka (poslední várka, zúžením). Menší oprava jde bez review a návrat
// ji nese v bez_review (commit z nasazení opravy), stejně jako soubor výsledku pro uzavření.
import { argsStavby, kontrola, stub, e2ePass, oprava } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK3 Automat výmazu', selhani: '500 na /zbytky' }] })
const odpoved = fe => (label, p, o, stav) => {
  if (label === 'e2e:řez 05:1') return FAIL
  if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['apps/sucho/automat.ts: spust'], ...fe })
  if (label === 'review:řez 05:oprava-e2e') return stub(label, { nalezu: 2, blokujicich: 1, balicky: [{ soubory: ['apps/sucho/automat.ts'], nalezy: ['N1'] }], follow_up_ids: ['N2'] })
  return null
}

export default {
  nazev: 'velká oprava po E2E jde přes review, malá do bez_review',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: odpoved({ radku_zmeneno: 420, nove_soubory: ['apps/sucho/automat.ts', 'apps/sucho/automat.test.ts'] }),
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const fe = k.jeden('fix-e2e:řez 05:1'), r = k.jeden('review:řez 05:oprava-e2e'), f = k.jeden('fix:řez 05:E2E.1'), b = k.jeden('verify:řez 05:e2e')
    k.obsahuje(fe, 'radku_zmeneno', 'počet řádků v zadání opravy'); k.pole(fe, ['radku_zmeneno', 'nove_soubory'], 'FIX')
    k.pred(fe, r); k.pred(r, f); k.pred(f, b)
    k.obsahuje(r, 'oprava přidala soubory apps/sucho/automat.ts a změnila 420 řádků', 'rozsah opravy'); k.neobsahuje(r, 'automat.test.ts', 'test mezi novými soubory kódu')
    k.obsahuje(f, 'Poslední várka', 'oprava zúžením'); k.obsahuje(f, 'N1', 'blokující nález')
    k.ok(!(v && v.bez_review && v.bez_review.length), `bez_review u zrevidované opravy: ${JSON.stringify(v && v.bez_review)}`)
    k.obsahuje(k.jeden('uzavření:řez 05'), 'N2 (FOLLOW-UP', 'FOLLOW-UP nález review opravy do follow-ups')
    const mala = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: odpoved({ radku_zmeneno: 40, nove_soubory: [] }) })
    const m = kontrola(mala.volani)
    m.nic(/^review:řez 05:oprava-e2e/, 'review malé opravy')
    const d2 = m.jeden('deploy:řez 05:2')
    const br = mala.vysledek && mala.vysledek.bez_review
    m.ok(Array.isArray(br) && br.length === 1 && d2 && br[0].commit === d2.odpoved.commit && /oprava po E2E \(pokus 1\) bez review: apps\/sucho\/automat\.ts: spust/.test(br[0].popis), `bez_review: ${JSON.stringify(br)}`)
    m.obsahuje(m.jeden('uzavření:řez 05'), '"bez_review":[{"commit"', 'bez_review v souboru výsledku')
    k.chyby.push(...m.chyby.map(x => `malá oprava: ${x}`))
    return k.chyby
  },
}

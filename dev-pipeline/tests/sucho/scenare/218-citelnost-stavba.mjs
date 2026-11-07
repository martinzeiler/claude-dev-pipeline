// 218 · stavba · 1.11.0 (spec D1, D2): vada čitelnosti není FAIL ani nestojí pokus. Sled oprava, review, brána, jedna oprava brány, commit
// a nasazení, bez druhého kola E2E. Druhá červená brána opravu vrátí, položky jdou do follow-ups, řez se uzavře.
import { argsStavby, kontrola, e2ePass, zelenaBrana } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const CIT = [{ plocha: 'Přehled', co: 'zkratka CPC bez vysvětlení', proc: 'uživatel nepozná metriku' }]
const E2E = (l, n) => l === 'e2e:řez 05:1' ? e2ePass(8, { citelnost: CIT }) : n
const CERVENA = zelenaBrana({ selhalo: 1, exit_kod: 1, selhavajici: ['x.test.ts'] })

export default {
  nazev: 'čitelnost: oprava bez pokusu a bez kola 2',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: l => E2E(l, null),
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.nic(/^(e2e:řez 05:2|fix-e2e:|implement:řez 05:2)/, 'druhé kolo E2E ani další pokus')
    const f = k.jeden('fix-citelnost:řez 05'), r = k.jeden('review:řez 05:citelnost'), b = k.jeden('verify:řez 05:cit'), d = k.jeden('deploy:řez 05:4')
    k.pred(f, r); k.pred(r, b); k.pred(b, d)
    k.obsahuje(f, 'Přehled: zkratka CPC bez vysvětlení (uživatel nepozná metriku)', 'položka v zadání opravy')
    k.obsahuje(d, 'rez 05: čitelnost po E2E', 'zpráva commitu')
    k.rovno(v && v.e2e && v.e2e.vysledek, 'pass', 'čitelnost nemění verdikt')
    k.rovno(v && v.e2e && v.e2e.fail, 0, 'čitelnost není FAIL')
    k.rovno(v && v.e2e && v.e2e.citelnost, ['Přehled: zkratka CPC bez vysvětlení (uživatel nepozná metriku)'], 'čitelnost jmenovitě v návratu')
    k.rovno(v && v.e2e && v.e2e.citelnost_stav, 'opraveno', 'stav opravy')
    k.pole(k.jeden('e2e:řez 05:1'), ['citelnost'], 'E2E')
    const cervena = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => /^verify:řez 05:cit(-2)?$/.test(l) ? CERVENA : E2E(l, null) })
    const c = kontrola(cervena.volani)
    c.navrat(cervena.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    c.jeden('fix-brana:řez 05'); c.jeden('verify:řez 05:cit-2')
    c.obsahuje(c.jeden('fix-citelnost:řez 05:vraceni'), 'Vrať jen změny této opravy', 'vrácení jen této opravy')
    c.nic(/^deploy:řez 05:4$/, 'nasazení opravy, která neprošla bránou')
    c.obsahuje(c.jeden('uzavření:řez 05'), 'čitelnost: Přehled: zkratka CPC bez vysvětlení (uživatel nepozná metriku); oprava neprošla bránou a je vrácená', 'follow-up')
    c.rovno(cervena.vysledek && cervena.vysledek.e2e && cervena.vysledek.e2e.citelnost_stav, 'follow-ups', 'stav')
    k.chyby.push(...c.chyby.map(x => `červená brána: ${x}`))
    const bezFixu = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'fix-citelnost:řez 05' ? { opraveno: 0, opravene_ids: [], zmenena_mista: [], typecheck: true, testy_zelene: true } : E2E(l, null) })
    const n = kontrola(bezFixu.volani)
    n.nic(/^(review:řez 05:citelnost|verify:řez 05:cit)/, 'review a brána opravy bez změny')
    n.obsahuje(n.jeden('uzavření:řez 05'), 'čitelnost: Přehled', 'follow-up opravy bez změny')
    k.chyby.push(...n.chyby.map(x => `bez změny: ${x}`))
    return k.chyby
  },
}

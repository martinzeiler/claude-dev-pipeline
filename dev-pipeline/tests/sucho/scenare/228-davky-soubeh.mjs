// 228 · stavba · 1.11.0 (spec I4): nálezy se složí do komponent podle skutečně sdílených souborů. Komponenty běží souběžně, uvnitř dávky po 6 sériově;
// malé komponenty se sbalí do dávek po 6. Nález bez souborů, nebo se souborem mimo balíček, vrací sériový režim. Agent dostane jen soubory své části.
import { argsStavby, kontrola, oprava, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const REPORT = `${CWD}/docs/reviews/rez-05-p1-code-review-kolo-1.md`
const f = c => `apps/sucho/${c}.ts`
const beh = (nalezy, nalezy_soubory, soubory) => spust({ blok: 'blok-stavby', args: argsStavby({ profil: 'lehky' }), odpoved: l => l === 'review:řez 05:1' ? { nalezu: nalezy.length, blokujicich: 0, report_path: REPORT, follow_up_ids: [], balicky: [{ soubory, nalezy }], nalezy_soubory } : null })
const ids = n => Array.from({ length: n }, (_, i) => `N${i + 1}`)
const SOUBORY = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(f)
const MALE = ids(8).map((id, i) => ({ id, soubory: [f(['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g'][i])] }))

export default {
  nazev: 'dávky balíčku souběžně podle souborů',
  blok: 'blok-stavby',
  args: argsStavby({ profil: 'lehky' }),
  odpoved: l => l === 'review:řez 05:1' ? { nalezu: 8, blokujicich: 0, report_path: REPORT, follow_up_ids: [], balicky: [{ soubory: SOUBORY, nalezy: ids(8) }], nalezy_soubory: MALE } : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pole(k.jeden('review:řez 05:1'), ['nalezy_soubory'], 'REVIEW')
    const d1 = k.jeden('fix:řez 05:kolo 1:balíček 1:dávka 1'), d2 = k.jeden('fix:řez 05:kolo 1:balíček 1:dávka 2')
    k.soubezne(d1, d2)
    k.obsahuje(d1, 'tvoje nálezy: N1, N2, N3, N4, N5, N6.', 'sbalené komponenty do 6 nálezů'); k.obsahuje(d2, 'tvoje nálezy: N7, N8.', 'zbytek')
    k.obsahuje(d1, `Sahej jen do souborů: ${['a', 'b', 'c', 'd', 'e'].map(f).join(', ')};`, 'soubory dávky 1'); k.obsahuje(d2, `Sahej jen do souborů: ${['f', 'g'].map(f).join(', ')};`, 'soubory dávky 2')
    k.obsahuje(d1, 'mimo tento seznam', 'přesah do rozsireny_zasah')
    k.ok(logy.some(l => l.includes('balíček 1 (kolo 1): 8 nálezů nad 7 soubory jde 2 dávkami souběžně (7 komponent, 2 proudů)')), `log: ${logy.filter(l => /balíček 1/.test(l)).join(' | ')}`)
    k.rovno(v && v.review && v.review.fix_agentu, 2, 'fix_agentu počítá dávky')
    const velka = await beh(ids(9), [...ids(8).map(id => ({ id, soubory: [f('a')] })), { id: 'N9', soubory: [f('x')] }], [f('a'), f('x')])
    const m = kontrola(velka.volani)
    const v1 = m.jeden('fix:řez 05:kolo 1:balíček 1:dávka 1'), v2 = m.jeden('fix:řez 05:kolo 1:balíček 1:dávka 2'), v3 = m.jeden('fix:řez 05:kolo 1:balíček 1:dávka 3')
    m.pred(v1, v2); m.soubezne(v1, v3)
    m.obsahuje(v2, 'předchozí dávky už své nálezy v těchto souborech opravily', 'navázání uvnitř komponenty'); m.neobsahuje(v3, 'předchozí dávky', 'jiná komponenta nenavazuje')
    k.chyby.push(...m.chyby.map(x => `velká komponenta: ${x}`))
    const bez = await beh(ids(8), MALE.slice(0, 7), SOUBORY)
    const n = kontrola(bez.volani)
    n.pred(n.jeden('fix:řez 05:kolo 1:balíček 1:dávka 1'), n.jeden('fix:řez 05:kolo 1:balíček 1:dávka 2'))
    n.ok(bez.logy.some(l => /běží sériově: nález bez souborů/.test(l)), 'log záložního režimu')
    k.chyby.push(...n.chyby.map(x => `bez souborů: ${x}`))
    const mimo = await beh(ids(8), MALE.map((x, i) => i === 0 ? { ...x, soubory: [f('cizi')] } : x), SOUBORY)
    const o = kontrola(mimo.volani)
    o.pred(o.jeden('fix:řez 05:kolo 1:balíček 1:dávka 1'), o.jeden('fix:řez 05:kolo 1:balíček 1:dávka 2'))
    o.ok(mimo.logy.some(l => /běží sériově: nález se souborem mimo balíček/.test(l)), 'log souboru mimo balíček')
    k.chyby.push(...o.chyby.map(x => `mimo balíček: ${x}`))
    return k.chyby
  },
}

// 175 · stavba · 1.9.0 (§ 4.1): balíček oprav nad 6 nálezů jde dávkami po nejvýš 6 nálezech se stejnou množinou souborů, sériově
// (nikdy dva agenti nad týmiž soubory), každá dávka vlastní agent fix:řez NN:kolo K:balíček B:dávka D jen se svými nálezy; balíček
// do 6 nálezů jede jako dřív jedním agentem souběžně. Návraty dávek se sčítají (fix_agentu počítá dávky).
import { argsStavby, kontrola, oprava, CWD } from '../stuby.mjs'

const IDS = Array.from({ length: 14 }, (_, i) => `N${i + 1}`)
const REPORT = `${CWD}/docs/reviews/rez-05-p1-code-review-kolo-1.md`

export default {
  nazev: 'balíček nad 6 nálezů jde dávkami sériově',
  blok: 'blok-stavby',
  args: argsStavby({ profil: 'lehky' }),
  odpoved(label) {
    if (label === 'review:řez 05:1') return { nalezu: 17, blokujicich: 0, report_path: REPORT, follow_up_ids: [], balicky: [{ soubory: ['apps/sucho/x.ts', 'apps/sucho/y.ts'], nalezy: IDS }, { soubory: ['apps/sucho/z.ts'], nalezy: ['N15', 'N16', 'N17'] }] }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const d = [1, 2, 3].map(i => k.jeden(`fix:řez 05:kolo 1:balíček 1:dávka ${i}`))
    k.nic(/^fix:řez 05:1\.1$/, 'jeden agent nad balíčkem 14 nálezů')
    k.pred(d[0], d[1]); k.pred(d[1], d[2])
    k.obsahuje(d[0], 'tvoje nálezy: N1, N2, N3, N4, N5, N6.', 'nálezy dávky 1'); k.obsahuje(d[1], 'tvoje nálezy: N7, N8, N9, N10, N11, N12.', 'nálezy dávky 2'); k.obsahuje(d[2], 'tvoje nálezy: N13, N14.', 'nálezy dávky 3')
    k.obsahuje(d[1], 'dávka 2 z 3 nad týmž balíčkem souborů: předchozí dávky už své nálezy v těchto souborech opravily', 'věta o dávce')
    k.obsahuje(d[0], 'dávka 1 z 3 nad týmž balíčkem souborů; tvoje jsou jen nálezy níže', 'věta dávky 1'); k.neobsahuje(d[0], 'předchozí dávky', 'věta o předchozích dávkách u dávky 1')
    for (const x of d) k.obsahuje(x, 'Sahej jen do souborů: apps/sucho/x.ts, apps/sucho/y.ts;', 'stejná množina souborů')
    const maly = k.jeden('fix:řez 05:1.2')
    k.obsahuje(maly, 'tvoje nálezy: N15, N16, N17.', 'malý balíček jedním agentem'); k.neobsahuje(maly, 'dávka', 'věta o dávce u malého balíčku')
    k.soubezne(d[0], maly)
    k.rovno(v && v.review && v.review.fix_agentu, 4, 'review.fix_agentu (3 dávky + 1)')
    k.ok(logy.some(l => l.includes('balíček 1 (kolo 1): 14 nálezů nad 2 soubory jde 3 dávkami sériově')), 'log dávek')
    return k.chyby
  },
}

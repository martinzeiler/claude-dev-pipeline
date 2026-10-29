// 203 · kolečko · 1.10.0 (spec C5, kontrakt 3): code-review kolečka po oblastech. Agent rozdělí změny větve do tří oblastí, tři
// revieweři běží souběžně (každý jen nad svými cestami, report s číslem oblasti) a čtvrtý projde celé commity bez review ze staveb
// (args bez_review). Balíčky ze všech reportů jdou jedné opravné vlně a počty kola 1 jsou součty.
import { argsKolecko, kontrola, CWD } from '../stuby.mjs'

const OBLASTI = [{ nazev: 'api', cesty: ['apps/api/src'], radku: 7000 }, { nazev: 'admin', cesty: ['apps/admin/src'], radku: 5000 }, { nazev: 'balíčky', cesty: ['packages/shared'], radku: 3000 }]
const BEZ = [{ commit: '05ae00f9aaaabbbbccccddddeeeeffff00001111', popis: 'oprava po E2E řezu 11 dopsala části K7 a K8' }]
const rep = n => `${CWD}/docs/reviews/kolecko-code-review-kolo-1-${n}.md`

export default {
  nazev: 'kolečko: code-review po oblastech a nad commity bez review',
  blok: 'blok-kolecko',
  args: argsKolecko({ bez_review: BEZ }),
  odpoved(label) {
    if (label === 'oblasti:kolečko') return { oblasti: OBLASTI, vsechny_adresare: ['apps/api/src', 'apps/api/src/routes', 'apps/admin/src', 'packages/shared/src'], vynechano: 'fixtury 12 000 ř.' }
    if (label === 'review:kolečko:1:1') return { nalezu: 2, blokujicich: 1, balicky: [{ soubory: ['apps/api/src/a.ts'], nalezy: ['N1'] }], report_path: rep(1), follow_up_ids: [] }
    if (label === 'review:kolečko:1:2') return { nalezu: 1, blokujicich: 0, balicky: [{ soubory: ['apps/admin/src/b.ts'], nalezy: ['N1'] }], report_path: rep(2), follow_up_ids: [] }
    if (label === 'review:kolečko:1:bez-review') return { nalezu: 1, blokujicich: 1, balicky: [{ soubory: ['apps/api/src/automat.ts'], nalezy: ['N1'] }], report_path: `${CWD}/docs/reviews/kolecko-code-review-bez-review.md`, follow_up_ids: [] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', review: { kolo1: { nalezu: 4, blokujicich: 2, fix_agentu: 3, revieweru: 4, bez_review: 1 } } })
    const ob = k.jeden('oblasti:kolečko')
    k.agent(ob, 'general-purpose', 'sonnet', 'low'); k.obsahuje(ob, 'git diff --numstat main...HEAD', 'počty řádků z gitu')
    k.nic(/^review:kolečko:1$/, 'jeden reviewer nad celou větví')
    const rs = [1, 2, 3].map(n => k.jeden(`review:kolečko:1:${n}`)), rb = k.jeden('review:kolečko:1:bez-review')
    k.vsechnySoubezne([...rs, rb], 'revieweři kola 1')
    for (const r of [...rs, rb]) { k.agent(r, 'dev-pipeline:code-review', 'opus', 'high'); k.pred(ob, r) }
    k.obsahuje(rs[0], 'oblast 1 z 3 „api“: jen změny větve v cestách apps/api/src', 'cesty oblasti')
    k.obsahuje(rs[1], rep(2), 'report s číslem oblasti')
    k.obsahuje(rs[2], 'nálezy hlas jen v oblasti')
    k.obsahuje(rb, BEZ[0].commit, 'commit bez review'); k.obsahuje(rb, 'Každý commit projdi celý', 'pokyn projít celé commity')
    k.pocet(/^fix:kolečko:kolo 1:/, 3, 'tři disjunktní balíčky ze tří reportů')
    k.jeden('verify:kolečko:kolo 1:1')
    return k.chyby
  },
}

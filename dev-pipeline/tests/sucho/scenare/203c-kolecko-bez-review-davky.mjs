// 203c · kolečko · 1.10.0 (review N12): 23 commitů bez review jde třem reviewerům po nejvýš 10, každý commit celý v zadání své dávky;
// nic se neusekne a log říká počet dávek.
import { argsKolecko, kontrola } from '../stuby.mjs'

const BEZ = Array.from({ length: 23 }, (_, i) => ({ commit: `c${String(i + 1).padStart(2, '0')}${'a'.repeat(37)}`, popis: `oprava po E2E ${i + 1} ${'x'.repeat(250)}` }))

export default {
  nazev: 'kolečko: commity bez review po nejvýš 10 na reviewera',
  blok: 'blok-kolecko',
  args: argsKolecko({ bez_review: BEZ }),
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.nic(/^review:kolečko:1:bez-review$/, 'jeden reviewer nad všemi 23 commity')
    const rs = [1, 2, 3].map(n => k.jeden(`review:kolečko:1:bez-review:${n}`))
    k.vsechnySoubezne(rs, 'revieweři commitů bez review')
    BEZ.forEach((x, i) => k.obsahuje(rs[Math.floor(i / 10)], x.commit, `commit ${i + 1} v dávce ${Math.floor(i / 10) + 1}`))
    k.neobsahuje(rs[0], BEZ[10].commit, 'commit 11 v první dávce')
    k.obsahuje(rs[2], 'dávka 3 z 3')
    k.ok(logy.some(l => l.includes('23 commitů bez review ze staveb jde 3 reviewerům po nejvýš 10')), 'log dávek')
    k.rovno(v && v.review && v.review.kolo1 && v.review.kolo1.bez_review, 23, 'review.kolo1.bez_review')
    return k.chyby
  },
}

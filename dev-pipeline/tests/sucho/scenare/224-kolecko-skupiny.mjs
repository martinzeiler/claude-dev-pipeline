// 224 · kolečko · 1.11.0 (spec G1, G2): sekce ze scénářů dají souběžné verifikátory jako ve stavbě (kolo 1 v běhu brief-a-provedeni 3 h 04 jedním
// verifikátorem); blok zaloguje součty pro porovnání s Povolením. V kole, které přeměřuje všechna kritéria, se skupiny mimo opravu přenesou.
import { argsKolecko, kontrola, e2ePass, oprava, parsujLabel } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const SEKCE = [
  { nazev: 'Sekce A', kriterii: 8, doba_min: 20, cekani_min: 10, zive_kusy: 2, oblasti: ['apps/a'] },
  { nazev: 'Sekce B', kriterii: 6, doba_min: 15, oblasti: ['apps/b'] },
  { nazev: 'Sekce C', kriterii: 4, doba_min: 5, bez_soubehu: true, zive_kusy: 1, oblasti: ['apps/c'] },
]
const sestav = { e2e_path: '/x', kriterii: 18, plochy: [], e2e_sekce: SEKCE }
const zSkupiny = l => { const p = parsujLabel(l); return p.typ === 'e2e' && p.pismeno ? e2ePass({ a: 8, b: 6, c: 4 }[p.pismeno], { report_path: `/r/${p.kolo}-${p.pismeno}.md` }) : null }

export default {
  nazev: 'kolečko: skupiny sekcí souběžně',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: l => l === 'e2e-scénáře:kolečko' ? sestav : zSkupiny(l),
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.nic(/^e2e:kolečko:1$/, 'jeden verifikátor přes všechny sekce')
    const a = k.jeden('e2e:kolečko:1:a'), b = k.jeden('e2e:kolečko:1:b'), c = k.jeden('e2e:kolečko:1:c')
    k.soubezne(a, b); k.pred(a, c); k.pred(b, c)
    k.obsahuje(a, 'VÝHRADNĚ sekce: Sekce A', 'sekce skupiny a'); k.obsahuje(c, 'nad aplikací teď běžíš sám', 'skupina bez souběhu sama'); k.obsahuje(a, '[E2E-a]', 'prefix dat')
    k.obsahuje(k.jeden('e2e-scénáře:kolečko'), 'e2e_sekce', 'pokyn autorovi'); k.pole(k.jeden('e2e-scénáře:kolečko'), ['e2e_sekce'], 'SESTAV')
    k.rovno(v && v.e2e && v.e2e.celkem, 18, 'součet verifikátorů')
    k.ok(logy.some(l => /E2E sekce kolečka: 3 sekcí, odhad 40 min, s čekáním 1, živých kusů 3, 3 skupin verifikátorů/.test(l)), `log součtů: ${logy.filter(l => /E2E sekce/.test(l)).join(' | ')}`)
    const oprav = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => {
      if (l === 'e2e-scénáře:kolečko') return sestav
      if (l === 'e2e:kolečko:1:a') return e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: [{ kriterium: 'AK1 A', selhani: 'x' }], report_path: '/r/1-a.md' })
      if (l === 'fix-e2e:kolečko:1') return oprava({ zmenena_mista: ['apps/a/x.ts: f'] })
      return zSkupiny(l)
    } })
    const m = kontrola(oprav.volani)
    m.navrat(oprav.vysledek, { ok: true, vysledek: 'hotovo' })
    m.jeden('e2e:kolečko:2:a'); m.nic(/^e2e:kolečko:2:[bc]$/, 'přenesené skupiny se nepouští')
    m.rovno(oprav.vysledek && oprav.vysledek.e2e && oprav.vysledek.e2e.prenesene_sekce, ['Sekce B', 'Sekce C'], 'přenesené sekce')
    m.rovno(oprav.vysledek && oprav.vysledek.e2e && oprav.vysledek.e2e.celkem, 18, 'počty s přenesenými sekcemi')
    k.chyby.push(...m.chyby.map(x => `přenos: ${x}`))
    return k.chyby
  },
}

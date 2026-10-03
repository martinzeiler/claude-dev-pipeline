// 64 · stavba · 1.5.0 (spec § 1.10): část startuje hned po svých závislostech, ne po celé předchozí vlně. K3 závisí na K1 a startuje,
// zatímco nezávislá pomalá K2 ještě běží (běh web-podzim: řez 12 K2 čekal 112 min na nesouvisející K4). Připravené části startují od
// největšího odhadu (K2 před K1). „Kontrakt“ v zavisi_na se tiše přijme.
import { argsStavby, casti, kontrola, rozhrani } from '../stuby.mjs'

const C = casti([['K1', ['Kontrakt']], ['K2'], ['K3', ['K1']]])
C[1].odhad_radku = 2000
const pomalu = async n => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)) }

export default {
  nazev: 'části bez bariéry vln, nejdelší první',
  blok: 'blok-stavby',
  args: argsStavby({ casti: C, kontrakt_potreba: true }),
  async odpoved(label) {
    if (label === 'implement:řez 05:část K2:1') await pomalu(12)
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const p = Object.fromEntries(['K1', 'K2', 'K3'].map(id => [id, k.jeden(`implement:řez 05:část ${id}:1`)]))
    k.pred(p.K1, p.K3)
    k.soubezne(p.K2, p.K3)
    if (p.K1 && p.K2) k.ok(p.K2.start < p.K1.start, `K2 (odhad 2000) má startovat před K1 (odhad 1000): K2 ${p.K2.start}, K1 ${p.K1.start}`)
    k.ok(logy.some(l => /část K3 start \(závislosti hotové: K1\)/.test(l)), 'log startu K3 se závislostí')
    k.ok(!logy.some(l => /neznámé závislosti/.test(l)), 'Kontrakt v zavisi_na hlášen jako neznámá závislost')
    k.ok(!logy.some(l => /vlna/.test(l)), 'log mluví o vlnách')
    rozhrani(k, volani)
    return k.chyby
  },
}

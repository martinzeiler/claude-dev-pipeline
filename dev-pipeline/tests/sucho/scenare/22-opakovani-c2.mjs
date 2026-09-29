// 22 · stavba · agent nevrátí výsledek a run() ho opakuje (§ 1.2, třída C2): opakování dostane větu o inventuře stromu,
// první běh ne.
import { argsStavby, kontrola, NIC } from '../stuby.mjs'

const C2 = 'Předchozí běh tohoto zadání skončil bez výsledku'

export default {
  nazev: 'opakování po chybě nese větu C2',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, prompt, opts, stav) {
    if (label === 'implement:řez 05:1' && stav.pocty[label] === 1) return NIC
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const xs = k.pocet(/^implement:řez 05:1$/, 2, 'první běh a jedno opakování')
    k.neobsahuje(xs[0], C2, 'větu C2 v prvním běhu')
    k.obsahuje(xs[1], C2, 'větu C2 při opakování')
    k.obsahuje(xs[1], 'git status', 'inventuru stromu')
    return k.chyby
  },
}

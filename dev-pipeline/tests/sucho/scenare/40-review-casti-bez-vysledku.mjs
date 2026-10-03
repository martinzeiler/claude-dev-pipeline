// 40 · stavba · revize 1.4.0 nález 7: review i thermo části K2 nevrátí výsledek v pokusu 1, pak červená brána. K2 není
// zrevidovaná: pokus 2 ji posoudí znovu (K1 ne), log ji jmenuje.
import { argsStavby, casti, kontrola, zelenaBrana, NIC, pokusZ } from '../stuby.mjs'

export default {
  nazev: 'review části bez výsledku: část posoudí další pokus',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: false }),
  odpoved(label, p, o, stav) {
    if (label === 'review:řez 05:část K2:1' || label === 'thermo:řez 05:část K2') return pokusZ(stav) === 1 ? NIC : null
    if (/^verify:řez 05:[12]$/.test(label) && pokusZ(stav) === 1) return zelenaBrana({ selhalo: 2, exit_kod: 1 })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.pocet(/^review:řez 05:část K2:1$/, 4, 'review K2 (3 běhy bez výsledku v pokusu 1 a 1 v pokusu 2)')
    k.pocet(/^thermo:řez 05:část K2$/, 4, 'thermo K2')
    k.pocet(/^review:řez 05:část K1:1$/, 1, 'review K1 jen jednou')
    // Pořadí v logu sleduje pořadí úloh review (od 1.5.0 review před thermo, nejdelší první).
    k.ok(logy.some(l => /část K2: (thermo a review|review a thermo) bez výsledku/.test(l)), 'log jmenuje nezrevidovanou část K2')
    return k.chyby
  },
}

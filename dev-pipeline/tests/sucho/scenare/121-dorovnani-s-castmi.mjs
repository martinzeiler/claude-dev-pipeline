// 121 · stavba · 1.7.0 (spec § 1.6): dorovnání jen deploye platí i pro řez s částmi. Pokus 1 selže jen na kroku po nasazení, strom
// se od nasazení nezměnil: pokus 2 nepouští opravu, kontrakt, části, review ani bránu, jen dorovná deploy.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'

const A = argsStavby({ casti: casti([['K1'], ['K2']]) })

export default {
  nazev: 'dorovnání jen deploye u řezu s částmi',
  blok: 'blok-stavby',
  args: A,
  odpoved(label, p, o, stav) {
    if (label === 'deploy:řez 05:1' && stav.pocty[label] === 1) return stub(label, { kroky_po_nasazeni: [{ id: 3, krok: 'ověř health', stav: 'selhalo', duvod: '500' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.nic(/^implement:řez 05:.*:2$/, 'dorovnání nepouští opravu ani části')
    k.pocet(/^verify:/, 1, 'brána jen v pokusu 1')
    k.pocet(/^deploy:řez 05:(p2:)?1$/, 2, 'nasazení v pokusu 1 a dorovnání (od 1.10.0 se štítkem pokusu)')
    const d = k.s(/^deploy:řez 05:(p2:)?1$/)[1]
    k.obsahuje(d, 'Dorovnání: minulý pokus selhal jen na krocích po nasazení', 'větu dorovnání')
    return k.chyby
  },
}

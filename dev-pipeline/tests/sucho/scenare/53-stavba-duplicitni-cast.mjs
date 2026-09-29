// 53 · stavba · revize 1.4.0 nález 15: args casti nesou dvě části s id K2. Stavba druhou zahodí (platí první), ale zaloguje to:
// řez by jinak tiše postavil méně, než PRD slibuje.
import { argsStavby, casti, kontrola } from '../stuby.mjs'

const C = [...casti([['K1'], ['K2']]), { ...casti([['K2']])[0], nazev: 'DUPLICITA-53' }]

export default {
  nazev: 'stavba: duplicitní část zalogována',
  blok: 'blok-stavby',
  args: argsStavby({ casti: C, kontrakt_potreba: false }),
  odpoved: () => null,
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.ok(logy.some(l => /duplicitní část K2 zahozena \(DUPLICITA-53\)/.test(l)), 'log o zahozené duplicitní části K2')
    k.pocet(/^implement:řez 05:část K2:1$/, 1, 'část K2 jednou')
    return k.chyby
  },
}

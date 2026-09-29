// 07 · stavba · čtyři předávky za sebou (§ 1.2, MAX_PREDAVEK 3): po :n4, který předá znovu, pátý agent nejde, fáze implementace
// selže; predavky ve výsledku sčítají i čtvrtou předávku (predavekCelkem++ před kontrolou stropu).
// K1 předává v každém pokusu, takže blok vyčerpá všechny pokusy; predavky = 4 × počet pokusů.
import { argsStavby, casti, kontrola, stub, hash, CWD } from '../stuby.mjs'

const C = casti([['K1'], ['K2']])

export default {
  nazev: '4 předávky za sebou',
  blok: 'blok-stavby',
  args: argsStavby({ casti: C, kontrakt_potreba: false }),
  odpoved(label) {
    if (/^implement:řez 05:část K1:\d+(:n\d+)?$/.test(label)) return stub(label, { stav: 'castecne', predavka: `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md` })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'implementace' })
    const pokusy = Number(v && v.pokusy) || 0
    k.ok(pokusy >= 1, `návrat.pokusy: ${v && v.pokusy}`)
    k.nic(/:n[5-9]$/, 'nástupce po vyčerpání stropu 3 předávek')
    for (let p = 1; p <= pokusy; p++) {
      k.pocet(new RegExp(`^implement:řez 05:část K1:${p}:n4$`), 1, `pokus ${p}: čtvrtý agent řetězu`)
      // Každý nástupce čte předávku svého bezprostředního předchůdce.
      for (let n = 2; n <= 4; n++) {
        const pr = volani.find(x => x.label === `implement:řez 05:část K1:${p}${n === 2 ? '' : `:n${n - 1}`}`)
        const na = volani.find(x => x.label === `implement:řez 05:část K1:${p}:n${n}`)
        if (pr && pr.odpoved) k.obsahuje(na, pr.odpoved.predavka, `předávku předchůdce ${pr.label}`)
      }
    }
    k.rovno(v && v.predavky, 4 * pokusy, 'návrat.predavky')
    k.nic(/^(deploy|e2e|uzavření|verify):/, 'fáze po selhané implementaci')
    return k.chyby
  },
}

// 34 · stavba · revize 1.4.0 nález 4: bezpečnostní balíček opraven v pokusu 1 (bez commitu), brána pokusu 1 červená i po opravě.
// Oprava leží necommitnutá v pracovním stromě; deploy pokusu 2 ji musí dostat ke commitu fix(security).
import { argsStavby, kontrola, zelenaBrana, stub, oprava, pokusZ, CWD } from '../stuby.mjs'

export default {
  nazev: 'bezpečnostní oprava z pokusu 1 dojde k deployi pokusu 2',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    const n = pokusZ(stav)
    if (label === 'review:řez 05:1' && n === 1) return stub(label, { nalezu: 1, blokujicich: 1, report_path: `${CWD}/docs/reviews/r.md`, balicky: [{ soubory: ['apps/sucho/auth.ts'], nalezy: ['N1'], security: true }] })
    if (label === 'fix:řez 05:1.1' && n === 1) return oprava({ security: true, zmenena_mista: ['apps/sucho/auth.ts: SEC-OPRAVA-34'] })
    if (/^verify:řez 05:[12]$/.test(label) && n === 1) return zelenaBrana({ selhalo: 1, exit_kod: 1 })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    const d = k.pocet(/^deploy:řez 05:1$/, 1, 'deploy jen v pokusu 2')
    k.obsahuje(d[0], 'SEC-OPRAVA-34', 'bezpečnostní opravu z pokusu 1')
    k.obsahuje(d[0], 'fix(security)')
    return k.chyby
  },
}

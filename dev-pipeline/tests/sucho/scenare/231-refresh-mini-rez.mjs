// 231 · stavba a PRD · 1.11.0 (spec H7; řez 23: čtvrtá kontrola nad nezměněným stromem, $3,57, 13 min): u prd_lehke s prázdným prd_stale se refresh nekoná
// a zapracovaný nález jde implementátorovi jako hypotéza. Se zestárlým PRD nebo u běžného řezu refresh zůstává.
import { argsStavby, argsPrd, kontrola } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const HYP = { report: '/r/prd.md', ids: ['N1'], blokujici: [], zapracovano_bez_kontroly: ['N1'] }

export default {
  nazev: 'mini-řez bez refreshe nad týmž stromem',
  blok: 'blok-stavby',
  args: argsStavby({ prd_lehke: true, hypotezy: HYP }),
  odpoved: () => null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.nic(/^prd-refresh/, 'refresh mini-řezu')
    k.obsahuje(k.jeden('implement:řez 05:1'), 'Tyto nálezy zapracoval blok PRD bez další kontroly a refresh se u mini-řezu nekoná; ověř, že zapracování platí: N1', 'hypotéza pro implementaci')
    k.ok(logy.some(l => /refresh PRD se u mini-řezu nekoná/.test(l)), 'log')
    const stale = await spust({ blok: 'blok-stavby', args: argsStavby({ prd_lehke: true, hypotezy: HYP, prd_stale: ['řez 03'] }), odpoved: () => null })
    k.ok(stale.volani.some(x => x.label === 'prd-refresh:řez 05'), 'zestárlé PRD refresh má')
    const bezny = await spust({ blok: 'blok-stavby', args: argsStavby({ hypotezy: HYP }), odpoved: () => null })
    k.ok(bezny.volani.some(x => x.label === 'prd-refresh:řez 05'), 'běžný řez refresh má')
    const prd = await spust({ blok: 'blok-prd', args: argsPrd({ prd_lehke: true }), odpoved: () => null })
    k.ok(prd.vysledek && prd.vysledek.stavba && prd.vysledek.stavba.prd_lehke === true, `blok PRD předá prd_lehke stavbě: ${JSON.stringify(prd.vysledek && prd.vysledek.stavba && prd.vysledek.stavba.prd_lehke)}`)
    return k.chyby
  },
}

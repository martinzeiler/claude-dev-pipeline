// 180 · stavba · 1.10.0 (spec B1, B2; třída N1): fix refreshe PRD dostane zákaz měnit počet a id částí a vrací casti_v_kostre. Když
// se tabulka v kostře po refreshi liší od částí stavby, blok skončí hned (selhalo, pokusy 0, fáze refresh) a nic nestaví: v běhu
// zaklad-dat refresh rozdělil části řezu 11, stavba postavila jen části z args a K7 s K8 šly do produkce jako pahýl.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const ARGS = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, prd_stale: ['řez 04: sklad'] }
const REFRESH = l => l === 'prd-refresh:řez 05' ? stub(l, { verdikt: 'needs-fixes', nalezu: 1, blokujicich: 1, nalezy_ids: ['N1'] }) : null

export default {
  nazev: 'refresh změní tabulku Částí: blok skončí bez stavby',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label) {
    if (label === 'prd-refresh-fix:řez 05') return stub(label, { zmenena_mista: ['Části: K2 rozdělena na K2 a K3'], casti_v_kostre: ['K1', 'K2', 'K3'] })
    return REFRESH(label)
  },
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', pokusy: 0, faze: 'refresh' })
    k.ok(v && /refresh změnil tabulku Částí \(kostra: K1, K2, K3, stavba: K1, K2\)/.test(v.detail || ''), `detail: ${v && v.detail}`)
    k.nic(/^(implement|review|thermo|verify|deploy|diagnose|uzavření):/, 'po rozdílu tabulky blok nic nestaví ani neuzavírá')
    const f = k.jeden('prd-refresh-fix:řez 05')
    k.obsahuje(f, 'Počet ani id částí neměň', 'zákaz měnit části'); k.obsahuje(f, 'stavba staví části K1, K2', 'části stavby'); k.pole(f, ['casti_v_kostre'], 'PRD_FIX')
    // Stejná množina v jiném pořadí a malými písmeny rozdílem není; chybějící pole jen do logu (pahýly hlídá brána).
    for (const [vk, popis] of [[['k2', 'K1'], 'stejné části'], [[], 'bez pole']]) {
      const b = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: l => l === 'prd-refresh-fix:řez 05' ? stub(l, { casti_v_kostre: vk }) : REFRESH(l) })
      k.ok(b.vysledek && b.vysledek.vysledek === 'hotovo', `${popis}: ${JSON.stringify(b.vysledek && [b.vysledek.vysledek, b.vysledek.detail])}`)
      if (!vk.length) k.ok(b.logy.some(l => /fix nevrátil casti_v_kostre/.test(l)), 'bez pole: log')
    }
    return k.chyby
  },
}

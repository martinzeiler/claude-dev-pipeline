// 229 · stavba · 1.11.0 (spec I5; řez 09, $36, 4× deploy): když diagnóza po selhání kroku po nasazení určí vadu kritéria, pokus 3 nenasazuje a neměří
// znovu; kritérium jde majiteli s prefixem a řez pokračuje na E2E a uzavření nad nasazeným commitem.
import { argsStavby, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const CHYBA = { kroky_po_nasazeni: [{ id: 1, krok: 'práh pokrytí všech aktivních', stav: 'selhalo', duvod: '14 z 20' }] }
const odpoved = vada => l => {
  if (/^deploy:řez 05:(p2:)?1$/.test(l)) return stub(l, CHYBA)
  if (l === 'diagnose:řez 05') return { pricina: 'limit.ts:10', doporuceni: 'změnit práh', smycka_postavena: true, ...(vada ? { vada_kriteria: { druh: 'práh nad mechanismem', dukaz: 'limit.ts:10 omezuje na 14' } } : {}) }
  return null
}

export default {
  nazev: 'vadné kritérium kroku po nasazení z diagnózy',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: odpoved(true),
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 3 })
    k.nic(/^(implement:řez 05:3|deploy:řez 05:p3)/, 'pokus 3 nestaví ani nenasazuje')
    k.jeden('e2e:řez 05:p3:1')
    k.obsahuje(k.jeden('diagnose:řez 05'), 'vada_kriteria', 'pravidlo v zadání diagnózy'); k.pole(k.jeden('diagnose:řez 05'), ['vada_kriteria'], 'DIAG')
    k.ok(pole(v && v.rozhodnuti).some(x => /^\[řez 05 vadné kritérium\] krok po nasazení, práh nad mechanismem: limit\.ts:10 omezuje na 14/.test(S(x))), `rozhodnutí: ${JSON.stringify(v && v.rozhodnuti)}`)
    const bez = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: odpoved(false) })
    k.ok(bez.volani.some(x => x.label === 'implement:řez 05:3'), 'bez vady kritéria jde pokus 3 celý')
    return k.chyby
  },
}
const pole = x => Array.isArray(x) ? x : []
const S = v => String(v == null ? '' : v)

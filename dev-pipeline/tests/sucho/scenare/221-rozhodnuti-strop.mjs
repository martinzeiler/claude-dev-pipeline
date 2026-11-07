// 221 · všechny bloky · 1.11.0 (spec E1): rozhodnutí majitele po celých položkách se stropem 8 000 znaků; vypadnou nejstarší s poznámkou a logem.
// Řez na 2 000 uprostřed věty vzal stavbám 22 až 24 rozhodnutí, kvůli kterým vznikly. Obnova položky přidává (spec G2).
import { argsStavby, argsKolecko, argsPrd, kontrola } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const POLOZKY = Array.from({ length: 40 }, (_, i) => `POL-${i}# ${'x'.repeat(400)}`)
const POZNAMKA = '… a 21 starších položek: docs/.run-args.json'

const over = (z, label, co) => {
  const k = kontrola(z.volani)
  const x = k.jeden(label)
  k.obsahuje(x, 'POL-39#', 'nejnovější položka'); k.obsahuje(x, 'POL-21#', 'poslední položka pod stropem'); k.neobsahuje(x, 'POL-20#', 'položka nad stropem')
  k.obsahuje(x, POZNAMKA, 'poznámka o vypadlých položkách')
  k.ok(z.logy.some(l => /rozhodnutí majitele nad strop 8000 znaků: vypadlo 21 nejstarších položek ze? 40/.test(l)), 'log')
  return k.chyby.map(c => `${co}: ${c}`)
}

export default {
  nazev: 'rozhodnutí majitele po celých položkách',
  blok: 'blok-stavby',
  args: argsStavby({ rozhodnuti_majitele: POLOZKY }),
  odpoved: () => null,
  async over(v, volani, logy) {
    const chyby = over({ volani, logy }, 'implement:řez 05:1', 'stavba')
    chyby.push(...over(await spust({ blok: 'blok-kolecko', args: argsKolecko({ rozhodnuti_majitele: POLOZKY }), odpoved: () => null }), 'thermo:kolečko', 'kolečko'))
    chyby.push(...over(await spust({ blok: 'blok-prd', args: argsPrd({ rozhodnuti_majitele: POLOZKY }), odpoved: () => null }), 'prd:řez 05', 'PRD'))
    const jedna = await spust({ blok: 'blok-stavby', args: argsStavby({ rozhodnuti_majitele: [`DLOUHA ${'y'.repeat(9000)}`] }), odpoved: () => null })
    const k = kontrola(jedna.volani)
    k.obsahuje(k.jeden('implement:řez 05:1'), `DLOUHA ${'y'.repeat(9000)}`, 'jediná položka nad stropem zůstává celá')
    return [...chyby, ...k.chyby]
  },
}

// 52 · PRD · revize 1.4.0 nálezy 15 a 11: architekt vrátí dvě části s id K2 a závislost „K 1“ s mezerou. Blok druhou K2
// přečísluje (log), duplicitu pošle k zapracování kostry a zavisi_na normalizuje jako id; návrat má jedinečná id.
import { argsPrd, kontrola, stub } from '../stuby.mjs'

const C = [
  { id: 'K1', nazev: 'první', soubory: ['apps/a/**'], kriteria: ['AK1'], odhad_radku: 1000, zavisi_na: [] },
  { id: 'K2', nazev: 'druhá', soubory: ['apps/b/**'], kriteria: ['AK2'], odhad_radku: 1000, zavisi_na: ['K 1'] },
  { id: 'K2', nazev: 'třetí', soubory: ['apps/c/**'], kriteria: ['AK3'], odhad_radku: 1000, zavisi_na: [] },
]
const OPRAVENE = C.map((c, i) => (i === 2 ? { ...c, id: 'K3' } : c))

export default {
  nazev: 'PRD: duplicitní id části',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 3, casti: C, odhad_radku: 3000, kontrakt_potreba: false })
    if (label === 'prd-fix:řez 05') return stub(label, { casti: OPRAVENE, zmenena_mista: ['Části: třetí část je K3'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    k.ok(logy.some(l => /id K2 dvakrát .*přečísloval na K3/.test(l)), 'log o přečíslování duplicitní K2')
    const f = k.pocet(/^prd-fix:řez 05$/, 1, 'zapracování kostry s duplicitou')[0]
    k.obsahuje(f, 'id K2 dvakrát', 'nález duplicitního id')
    for (const a of k.s(/^prd-část:/)) k.pred(f, a)
    if (v) {
      const ids = (v.casti || []).map(c => c.id)
      k.ok(new Set(ids).size === ids.length && ids.length === 3, `návrat.casti id: ${ids.join(', ')}`)
      k.rovno(((v.casti || []).find(c => c.id === 'K2') || {}).zavisi_na, ['K1'], 'zavisi_na K2 normalizované jako id')
    }
    return k.chyby
  },
}

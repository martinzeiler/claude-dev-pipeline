// 133c · PRD · 1.7.0 dlouhý výčet cekani (spec 1.7.0 § 1.1, § 1.4 spec 1.6.0): část pro orchestrátora zůstane pod 6 000 znaků,
// nad strop počtu zůstane souhrnná položka (celý výčet nese PRD značkou „čeká na rozhodnutí majitele“). Bez sekce kroků po
// nasazení je kroky_po_nasazeni null.
import { argsPrd, kontrola, stub } from '../stuby.mjs'

const dlouhe = (n, z) => z.repeat(Math.ceil(n / z.length)).slice(0, n)
const MNOHO = Array.from({ length: 60 }, (_, i) => ({ kriterium: `AK${i + 1} ${dlouhe(300, 'název ')}`, potreba: dlouhe(1500, 'potřeba dat '), odhad_h: 10 }))

export default {
  nazev: 'PRD: dlouhý výčet cekani pod 6 000 znaků',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { cekani: MNOHO })
    return null
  },
  over(v) {
    const k = kontrola([])
    const { stavba, ...orch } = v || {}
    const delka = JSON.stringify(orch).length
    k.ok(delka < 6000, `část pro orchestrátora má ${delka} znaků`)
    const c = (v && v.cekani) || []
    k.ok(c.length > 1 && /… a \d+ dalších/.test(c[c.length - 1].kriterium), `souhrnná položka cekani: ${JSON.stringify(c.slice(-1))}`)
    k.rovno(v && v.kroky_po_nasazeni, null, 'kroky_po_nasazeni bez sekce')
    return k.chyby
  },
}

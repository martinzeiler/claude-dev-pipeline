// 82 · PRD · 1.5.0 požadavky autorů na Kontrakt celé (spec 1.5.0 § 1.14 bod 5): seznam kontrakt_doplnit nad 2 000 znaků
// dojde do kontroly kostry i do zapracování kostry celý. Běh web-podzim: ořez slice(0, 2000) ztratil 111 ze 197 požadavků.
import { argsPrd, kontrola, stub } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const DLOUHY = i => `DLOUHY-${i}: ${'sdílený typ s poli a validací '.repeat(30)}`
const KONEC = 'KONEC-POZADAVKU-K3: signatura spocitejRozpocet sdílená s K1'

export default {
  nazev: 'PRD: kontrakt_doplnit nad 2 000 znaků celý',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-část:řez 05:K1') return stub(label, { kontrakt_doplnit: [DLOUHY(1), DLOUHY(2), DLOUHY(3)] })
    if (label === 'prd-část:řez 05:K3') return stub(label, { kontrakt_doplnit: [KONEC] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    k.ok(DLOUHY(1).length * 3 > 2000, 'scénář: požadavky K1 nepřesahují 2 000 znaků')
    const ks = k.jeden('prd-check:řez 05:1'), fk = k.jeden('prd-fix:řez 05')
    for (const x of [ks, fk]) { k.obsahuje(x, KONEC, 'poslední požadavek autora za 2 000 znaky'); k.obsahuje(x, DLOUHY(3), 'třetí dlouhý požadavek celý') }
    return k.chyby
  },
}

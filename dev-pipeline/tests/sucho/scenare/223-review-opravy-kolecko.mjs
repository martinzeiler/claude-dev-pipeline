// 223 · stavba a kolečko · 1.11.0 (spec F1, F2): každá oprava kódu po E2E dostane jedno kolo review, i fix(security) a fix-e2e v kolečku. bez_review
// zůstává jen pro review, které nevrátilo výsledek.
import { argsStavby, argsKolecko, kontrola, stub, e2ePass, NIC } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const FAIL = n => e2ePass(n, { vysledek: 'fail', pass: n - 1, fail: 1, fail_kriteria: [{ kriterium: 'AK3 Export', selhani: '500' }] })
const SEC = e2ePass(8, { zavazne_mimo_ak: ['únik tokenu v logu'] })

export default {
  nazev: 'review oprav po E2E: bezpečnost a kolečko',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: l => l === 'e2e:řez 05:1' ? SEC : l === 'deploy:řez 05:3' ? stub(l, { security_commity: ['abc123'] }) : null,
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', bez_review: [] })
    const f = k.jeden('fix-security:řez 05'), r = k.jeden('review:řez 05:fix-security'), b = k.jeden('verify:řez 05:sec')
    k.pred(f, r); k.pred(r, b)
    const nic = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'review:řez 05:fix-security' ? NIC : l === 'e2e:řez 05:1' ? SEC : l === 'deploy:řez 05:3' ? stub(l, { security_commity: ['abc123'] }) : null })
    const br = nic.vysledek && nic.vysledek.bez_review
    k.ok(Array.isArray(br) && br.length === 1 && br[0].commit === 'abc123' && /fix\(security\) po E2E \(pokus 1\) bez review/.test(br[0].popis), `bez_review bez výsledku review: ${JSON.stringify(br)}`)
    const kl = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => {
      if (l === 'e2e:kolečko:1') return FAIL(5)
      if (l === 'review:kolečko:oprava-e2e') return stub(l, { nalezu: 2, blokujicich: 1, balicky: [{ soubory: ['apps/sucho/export.ts'], nalezy: ['N1'] }], follow_up_ids: ['N2'] })
      return null
    } })
    const m = kontrola(kl.volani)
    m.navrat(kl.vysledek, { ok: true, vysledek: 'hotovo' })
    const fe = m.jeden('fix-e2e:kolečko:1'), re = m.jeden('review:kolečko:oprava-e2e'), fr = m.jeden('fix:kolečko:opravy po E2E:1'), ve = m.jeden('verify:kolečko:oprava po E2E:1')
    m.pred(fe, re); m.pred(re, fr); m.pred(fr, ve)
    m.ok(fr && fr.phase === 'Deploy a E2E', `fáze opravy: ${fr && fr.phase}`)
    m.obsahuje(m.jeden('závěr:kolečko'), 'N2 (FOLLOW-UP', 'FOLLOW-UP review opravy')
    k.chyby.push(...m.chyby.map(x => `kolečko: ${x}`))
    return k.chyby
  },
}

// 38 · kolečko · revize 1.4.0 nález 5: obnova od kola 1; commit vlny kola 1 udělá fix(security) a pak padne na pre-commitu.
// Hash fix(security) z neúspěšného návratu jde do návratu kolečka a zadání commitu nese větu o commitu z přerušeného běhu.
import { argsKolecko, kontrola, hash, CWD, S } from '../stuby.mjs'

const SEC = hash('fix(security) 38')
const VETA = 'může už existovat (git log --grep): nový nedělej, vrať jejich hashe'

export default {
  nazev: 'kolečko: commit vlny selže po fix(security)',
  blok: 'blok-kolecko',
  args: argsKolecko({ obnova: { od_faze: 'kolo 1', znacka: 'Z38' } }),
  odpoved(label) {
    if (label === 'review:kolečko:1') return { nalezu: 1, blokujicich: 1, report_path: `${CWD}/docs/reviews/kolecko-code-review-kolo-1.md`, balicky: [{ soubory: ['apps/api/auth.ts'], nalezy: ['N1'], security: true }], follow_up_ids: [] }
    if (label === 'commit:kolečko:kolo 1') return { stav: 'failed', commit: hash('HEAD'), security_commity: [SEC], duvod: 'PRE-COMMIT-38: lint padl' }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'code-review kolo 1' })
    k.ok(S(v && v.detail).includes('PRE-COMMIT-38'), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    k.ok(v && v.security && (v.security.commity || []).includes(SEC), `návrat.security.commity: ${JSON.stringify(v && v.security)}`)
    k.ok(v && (v.commity || []).includes(SEC), `návrat.commity: ${JSON.stringify(v && v.commity)}`)
    k.obsahuje(k.jeden('commit:kolečko:kolo 1'), VETA, 'větu o commitu z přerušeného běhu')
    return k.chyby
  },
}

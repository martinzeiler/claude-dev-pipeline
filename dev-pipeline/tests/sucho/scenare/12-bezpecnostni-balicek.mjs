// 12 · stavba · bezpečnostní balíček z review (§ 3 bod 19): fix agent necommituje, deploy dostane bezpečnostní opravy
// (soubory a popis) a commitne je samostatně; hashe z deploye jdou do návratu a uzavření je ověří.
import { argsStavby, kontrola, stub, oprava, hash, CWD } from '../stuby.mjs'

const SEC = hash('fix(security) řez 05')

export default {
  nazev: 'bezpečnostní balíček: fix necommituje, commitne deploy',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'review:řez 05:1') return { nalezu: 1, blokujicich: 1, report_path: `${CWD}/docs/reviews/rez-05-p1-code-review-kolo-1.md`, balicky: [{ soubory: ['apps/api/auth.ts'], nalezy: ['N1'], security: true }], follow_up_ids: [] }
    if (label === 'fix:řez 05:1.1') return oprava({ security: true, zmenena_mista: ['apps/api/auth.ts: overOpravneni'] })
    if (label === 'deploy:řez 05:1') return stub(label, { security_commity: [SEC] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const f = k.jeden('fix:řez 05:1.1'), de = k.jeden('deploy:řez 05:1'), uz = k.jeden('uzavření:řez 05')
    k.obsahuje(f, 'Necommituj')
    k.ok(!f || !/udělej samostatný commit/.test(f.prompt), 'fix bezpečnostního balíčku má za úkol commit')
    k.pred(f, de)
    k.obsahuje(de, 'apps/api/auth.ts', 'soubory bezpečnostní opravy')
    k.obsahuje(de, 'fix(security)', 'samostatný commit fix(security)')
    k.obsahuje(de, 'security_commity')
    k.ok(v && Array.isArray(v.security_commity) && v.security_commity.includes(SEC), `návrat.security_commity nenese hash z deploye: ${JSON.stringify(v && v.security_commity)}`)
    k.obsahuje(uz, SEC, 'bezpečnostní commit k ověření')
    return k.chyby
  },
}

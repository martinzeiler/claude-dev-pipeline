// 20 · kolečko · bezpečnostní balíček (§ 4 bod 19): fix agent necommituje, vlna po zelené bráně předá commitu bezpečnostní
// opravy (soubory a popis) a commit agent vrátí security_commity; závěr ověří hashe přes git cat-file.
// Výklad: hashe z security_commity commitu se objeví v dnešním poli návratu security.commity.
import { argsKolecko, kontrola, parsujLabel, oprava, hash, CWD } from '../stuby.mjs'

const SEC = hash('fix(security) kolečko')

export default {
  nazev: 'bezpečnostní balíček: fix necommituje, commit vlny nese opravy',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    const l = parsujLabel(label)
    const bezp = /bezpe/.test(l.dalsi[0] || '')
    if (label === 'security:kolečko:čočka') return { nalezu: 1, blokujicich: 1, report_path: `${CWD}/docs/reviews/kolecko-security-cocka.md`, balicky: [{ soubory: ['apps/api/auth.ts'], nalezy: ['S1'], security: true }], follow_up_ids: [], metodika: 'vlastní průchod' }
    if (l.typ === 'fix' && bezp) return oprava({ security: true, zmenena_mista: ['apps/api/auth.ts: overOpravneni'] })
    if (l.typ === 'commit' && bezp) return { stav: 'commit-only', commit: hash('kolecko: bezpečnost'), security_commity: [SEC], duvod: '' }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const f = k.s(/^fix:kolečko:bezpečnost/)[0], vb = k.s(/^verify:kolečko:bezpečnost/)[0], c = k.jeden('commit:kolečko:bezpečnost')
    k.ok(!!f, 'chybí fix bezpečnostního balíčku'); k.ok(!!vb, 'chybí brána po bezpečnostní vlně')
    k.obsahuje(f, 'Necommituj')
    k.ok(!f || !/udělej samostatný commit/.test(f.prompt), 'fix bezpečnostního balíčku má za úkol commit')
    k.pred(f, vb); k.pred(vb, c)
    k.obsahuje(c, 'apps/api/auth.ts', 'soubory bezpečnostní opravy'); k.obsahuje(c, 'fix(security)')
    k.pole(c, ['security_commity', 'infra', 'predavka'], 'DEPLOY')
    const commity = [...((v && v.security && v.security.commity) || []), ...((v && v.commity) || [])]
    k.ok(commity.includes(SEC), `návrat bez bezpečnostního commitu z kroku commitu: ${JSON.stringify(v && v.security)}`)
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, SEC, 'bezpečnostní commit k ověření'); k.obsahuje(z, 'git cat-file')
    k.pole(z, ['chybejici_commity'], 'CLOSE')
    return k.chyby
  },
}

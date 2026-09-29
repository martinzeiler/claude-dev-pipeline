// 36 · stavba · revize 1.4.0 nález 5: deploy commitne fix(security) a commit řezu a pak padne na přihlášení CLI (infra). Návrat
// zastavení nese commit i security_commity z neúspěšného návratu, jinak je obnova commitne podruhé.
import { argsStavby, kontrola, stub, oprava, CWD } from '../stuby.mjs'

const C = 'c'.repeat(40), SEC = 'b'.repeat(40)

export default {
  nazev: 'infra zastavení vrací commit a fix(security)',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'review:řez 05:1') return stub(label, { nalezu: 1, blokujicich: 1, report_path: `${CWD}/r.md`, balicky: [{ soubory: ['apps/a.ts'], nalezy: ['N1'], security: true }] })
    if (label === 'fix:řez 05:1.1') return oprava({ security: true, zmenena_mista: ['apps/a.ts: SEC-FIX'] })
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'failed', infra: true, duvod: 'wrangler: not logged in', commit: C, security_commity: [SEC] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra', commit: C, security_commity: [SEC] })
    return k.chyby
  },
}

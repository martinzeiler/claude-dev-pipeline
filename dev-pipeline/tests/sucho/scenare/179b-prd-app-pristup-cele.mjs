// 179b · PRD · 1.9.0 (§ 7.2): pokyny majitele k prostředí jdou architektovi i kontrole celé (dřív slice 1 200 znaků).
import { argsPrd, kontrola, rozhrani } from '../stuby.mjs'

const PRISTUP = `${'pokyn k prostředí '.repeat(75)}KONEC-179b`

export default {
  nazev: 'PRD: app_pristup celé',
  blok: 'blok-prd',
  args: argsPrd({ app_pristup: PRISTUP }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    for (const l of ['prd:řez 05', 'prd-check:řez 05:1']) k.obsahuje(k.jeden(l), 'KONEC-179b', 'konec pokynů k prostředí (celé znění)')
    rozhrani(k, volani)
    return k.chyby
  },
}

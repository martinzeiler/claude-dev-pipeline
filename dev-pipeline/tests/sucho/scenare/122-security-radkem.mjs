// 122 · stavba · 1.7.0 (spec § 1.10): bezpečnostní oprava v souboru, který řez sám vytvořil, jde řádkem fix(security) do commitu řezu
// (běh sonnet-5-5, řez 04). Deploy vrátí security_radkem, blok to zaloguje, výsledek nese security_radkem a další pokus po selhání
// kroku tytéž opravy znovu nedostane (dřív :966 je poslal znovu).
import { argsStavby, kontrola, stub, oprava, CWD } from '../stuby.mjs'

const C = 'd'.repeat(40)

export default {
  nazev: 'bezpečnostní oprava řádkem v commitu řezu',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (label === 'review:řez 05:1') return stub(label, { nalezu: 1, blokujicich: 1, report_path: `${CWD}/r.md`, balicky: [{ soubory: ['apps/novy-soubor.ts'], nalezy: ['N1'], security: true }] })
    if (label === 'fix:řez 05:1.1') return oprava({ security: true, opravene_ids: ['N1'], zmenena_mista: ['apps/novy-soubor.ts: SEC-122 klíč v redakci'] })
    if (label === 'deploy:řez 05:1' && stav.pocty[label] === 1) return stub(label, { commit: C, security_radkem: C, kroky_po_nasazeni: [{ id: 2, krok: 'ověř health', stav: 'selhalo', duvod: '500' }] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2, security_radkem: [C] })
    k.ok(logy.some(l => l.includes(`řádkem v ${C}`)), 'log bezpečnostní opravy řádkem')
    const d = k.s(/^deploy:řez 05:1$/)
    k.obsahuje(d[0], 'SEC-122', 'bezpečnostní oprava v prvním nasazení')
    if (d[1]) k.neobsahuje(d[1], 'SEC-122', 'tutéž bezpečnostní opravu v dalším pokusu')
    return k.chyby
  },
}

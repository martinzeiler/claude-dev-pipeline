// 103 · PRD · 1.6.0 lehké PRD mini-řezu (spec 1.6.0 § 1.8): prd_lehke vynechá delta kontrolu i při dvou blokujících nálezech
// kola 1; zbylé nálezy jdou stavbě jako hypotézy. Mini-řez 11 běhu web-rijen čekal na PRD 49 min na kritické cestě.
import { argsPrd, kontrola, rozhrani, CWD } from '../stuby.mjs'

export default {
  nazev: 'PRD: prd_lehke vynechá deltu',
  blok: 'blok-prd',
  args: argsPrd({ prd_lehke: true }),
  odpoved(label) {
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 3, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2', 'N3'] }
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, prd_lehke: true, profil: 'plny' })
    k.jeden('prd-fix:řez 05')
    k.nic(/^prd-check:řez 05:2$/, 'delta kontrola u lehkého PRD')
    k.ok(logy.some(l => /delta kontrola se nekoná \(lehké PRD mini-řezu\)/.test(l)), 'log o lehkém PRD')
    k.rovno(v && v.stavba && v.stavba.hypotezy && v.stavba.hypotezy.ids, ['N1', 'N2', 'N3'], 'zbylé nálezy jako hypotézy')
    rozhrani(k, volani)
    return k.chyby
  },
}

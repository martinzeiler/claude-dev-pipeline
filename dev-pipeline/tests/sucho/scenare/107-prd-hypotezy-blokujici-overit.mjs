// 107 · PRD · 1.6.0 hypotézy pro stavbu (spec 1.6.0 § 1.5): blokující nálezy delty, které zbyly, jdou zvlášť v blokujici (blok
// stavby nad nimi pustí refresh i bez prd_stale); nespustitelné nejisté nálezy nad kritérii z obou kol jdou v overit_prvni,
// ne mezi blokující (Martin 6. 10.). Kontrola o overit_prvni ví ze zadání i schématu.
import { argsPrd, kontrola, rozhrani, CWD } from '../stuby.mjs'

const rep = kolo => `${CWD}/docs/reviews/rez-05-prd-check-kolo-${kolo}.md`

export default {
  nazev: 'PRD: hypotézy pro stavbu s blokujícími a overit_prvni',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 3, blokujicich: 2, osy: ['C'], report_path: rep(1), nalezy_ids: ['N1', 'N2', 'N3'], overit_prvni: [{ id: 'N3', kriterium: 'AK5', hypoteza: 'písmo se kreslí jen s preloadem' }] }
    if (label === 'prd-check:řez 05:2') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 1, osy: ['C'], report_path: rep(2), nalezy_ids: ['N1', 'N4'], overit_prvni: [{ id: 'N4', kriterium: 'AK6', hypoteza: 'optional nechá náhradní písmo' }] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const h = v && v.stavba && v.stavba.hypotezy
    k.rovno(h && h.blokujici, ['N1'], 'hypotezy.blokujici (jen blokující delty)')
    k.rovno(h && h.ids, ['N1', 'N4'], 'hypotezy.ids po deltě')
    k.rovno(h && h.overit_prvni.map(o => [o.id, o.kriterium]), [['N3', 'AK5'], ['N4', 'AK6']], 'hypotezy.overit_prvni z obou kol')
    for (const l of ['prd-check:řez 05:1', 'prd-check:řez 05:2']) k.pole(k.jeden(l), ['overit_prvni'], 'CHECK_SCHEMA')
    k.obsahuje(k.jeden('prd-check:řez 05:1'), 'vrať ho v overit_prvni', 'pokyn k nespustitelnému nejistému nálezu')
    k.obsahuje(k.jeden('prd-check:řez 05:1'), 'mezi blokující ho nepočítej')
    rozhrani(k, volani)
    return k.chyby
  },
}

// 81 · PRD · 1.6.0 bez mapa_kostry (spec 1.6.0 § 1.3): mapu sekcí kostry si každý čtenář udělá sám jedním rg nad kostrou;
// pole mapa_kostry zmizelo ze schématu, zadání i návratu (v běhu web-rijen dostala stavba 8 mapu řezu 7 se stejnými nadpisy).
// Čtenáři části čtou ze sekce kritérií jen svá kritéria podle ID (rozbor-prd návrh 11).
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const IDS = CASTI3.map(c => c.id)
const KOSTRA = `${CWD}/docs/prd/rez-05-sucho.md`

export default {
  nazev: 'PRD: čtenáři kostry si mapu sekcí dělají sami',
  blok: 'blok-prd',
  // Starý volající ještě posílá mapa_kostry: blok ho ignoruje.
  args: argsPrd({ mapa_kostry: 'STARA-MAPA: 1-30 ## Cíl' }),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true, mapa_kostry: 'MAPA-OD-ARCHITEKTA' })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-fix:řez 05') return stub(label, { zmenena_mista: ['Kontrakt: typ Rozpocet'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    k.ok(v && !('mapa_kostry' in v) && !('mapa_kostry' in (v.stavba || {})), 'návrat bez mapa_kostry')
    const ar = k.jeden('prd:řez 05')
    k.ok(ar && !ar.klice.includes('mapa_kostry'), 'PRD_SCHEMA bez pole mapa_kostry')
    for (const x of volani) {
      k.neobsahuje(x, 'MAPA-OD-ARCHITEKTA', 'mapu od architekta'); k.neobsahuje(x, 'STARA-MAPA', 'mapu z args')
      k.neobsahuje(x, 'mapa_kostry', 'pole mapa_kostry')
    }
    const rg = `rg -n '^## ' ${KOSTRA}`
    for (const id of IDS) {
      const c = CASTI3.find(x => x.id === id)
      for (const l of [`prd-část:řez 05:${id}`, `prd-check:řez 05:část ${id}:1`, `prd-fix:řez 05:část ${id}`]) {
        const x = k.jeden(l)
        k.obsahuje(x, rg, 'mapu sekcí přes rg nad kostrou')
        k.obsahuje(x, `rg -n '\\b(${c.kriteria.join('|')})\\b' ${KOSTRA}`, 'jen svá kritéria podle ID')
      }
    }
    for (const l of ['prd-check:řez 05:1', 'prd-fix:řez 05', 'prd-check:řez 05:2']) k.obsahuje(k.jeden(l), rg, 'mapu sekcí přes rg nad kostrou')
    rozhrani(k, volani)
    return k.chyby
  },
}

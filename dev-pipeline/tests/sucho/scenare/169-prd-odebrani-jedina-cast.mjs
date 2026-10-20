// 169 · PRD · review 1.8.0 N11: po odebrání části zbývá jediná část, takže řez je bez částí (jako normCasti): stavba dostane
// casti prázdné, bez kontraktu, odhad řádků bez odebrané části; zapracování dostane pokyn sloučit zbylou část do kostry.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'

const CASTI2 = [
  { id: 'K1', nazev: 'API', soubory: ['apps/api/src/rozpocty/**'], kriteria: ['AK1', 'AK2'], odhad_radku: 1200, zavisi_na: [], prd_path: prdCasti('K1') },
  { id: 'K2', nazev: 'UI', soubory: ['apps/web/src/rozpocty/**'], kriteria: ['AK3'], odhad_radku: 1000, zavisi_na: ['K1'], prd_path: prdCasti('K2') },
]

export default {
  nazev: 'PRD: odebrání části s jedinou zbylou dává řez bez částí',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['odeber část K2: UI postavil řez 04'], puvodni: { casti: CASTI2, kriteria: 6, odhad_radku: 2200, kontrakt_potreba: true } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 4, casti: [CASTI2[0]], casti_odebrane: ['K2'], zmenena_mista: ['Části: K2 odebrána', 'AK3'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rezim: 'zapracovani', casti_pocet: 0, kontrakt_potreba: false, odhad_radku: 1200 })
    k.rovno(v && v.stavba && v.stavba.casti, [], 'stavba.casti prázdné')
    k.rovno(v && v.stavba && v.stavba.kontrakt_potreba, false, 'stavba.kontrakt_potreba')
    k.rovno(v && v.stavba && v.stavba.kontrakt_odhad_radku, null, 'stavba.kontrakt_odhad_radku')
    const fx = k.jeden('prd-fix:řez 05')
    k.obsahuje(fx, 'Když po odebrání zbývá jediná část, řez je bez částí: technický postup té části přenes do kostry, tabulku Části a sekci Kontrakt zruš', 'pokyn ke sloučení zbylé části')
    k.ok(logy.some(l => l.includes('zbývá jediná část K1: řez je bez částí')), 'log o řezu bez částí')
    k.ok(logy.some(l => l.includes('části odebrané na žádost nálezu orchestrátora: K2')), 'log odebrání')
    const d = k.jeden('prd-check:řez 05:2')
    k.obsahuje(d, 'řeší nálezy orchestrátora ze zadání zapracování (včetně odebrání části; nálezy: odeber část K2: UI postavil řez 04)', 'delta v zapracování mluví o nálezech orchestrátora')
    k.neobsahuje(d, 'blokující nálezy kola 1', 'kolo 1 v deltě zapracování')
    rozhrani(k, volani)
    return k.chyby
  },
}

// 147 · stavba · 1.8.0 (spec § 2.6, review N8): follow-upy, které blok skládá sám, mají tvar `[řez NN · <oblast>] [<osud>] text`: nález
// se soubory nebo cestou je [oprava], text s majitelem nebo Povolením [rozhodnutí], jinak [nápad]; oblast z prvního souboru nebo oblastí
// řezu, u nálezů review mimo balíček „review“. Uzavření položky zapíše pod nadpis řezu a po zápisu spustí kontroly nad docs/ (brána
// je nespouští, § 2.12).
import { argsStavby, kontrola, stub, oprava, CWD, PLUGIN } from '../stuby.mjs'

const RK = 'pnpm straze:follow-ups'

export default {
  nazev: 'osud follow-upů a kontroly nad docs/ v uzavření',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsStavby(), rez: '05', rychle_kontroly: RK }
    if (label === 'implement:řez 05:1') return stub(label, { follow_ups: ['zvážit s majitelem přejmenování sekce Průvodci', 'sjednotit ikony v menu'] })
    if (label === 'review:řez 05:1') return stub(label, { nalezu: 2, blokujicich: 0, report_path: `${CWD}/docs/reviews/r147.md`, balicky: [{ soubory: ['apps/a.ts'], nalezy: ['N1'] }], follow_up_ids: ['N1', 'N9'] })
    if (label === 'fix:řez 05:1.1') return oprava({ opravene_ids: [] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const uz = k.jeden('uzavření:řez 05')
    k.obsahuje(uz, '[řez 05 · sucho] [rozhodnutí] zvážit s majitelem přejmenování sekce Průvodci', 'osud rozhodnutí s oblastí řezu')
    k.obsahuje(uz, '[řez 05 · sucho] [nápad] sjednotit ikony v menu', 'osud nápad')
    k.obsahuje(uz, `[řez 05 · review] [oprava] N9 (FOLLOW-UP z ${CWD}/docs/reviews/r147.md)`, 'osud oprava u nálezu review mimo balíček')
    k.obsahuje(uz, '[řez 05 · apps] [oprava] N1 (FOLLOW-UP z', 'osud oprava s oblastí ze souboru balíčku')
    const polozky = (/sekce Follow-ups\): (\[.*?\])\. Položka „/.exec(uz ? uz.prompt : '') || [])[1]
    k.ok(polozky && JSON.parse(polozky).every(x => /^\[řez 05 · [^\]]+\] \[(rozhodnutí|oprava|nápad|obsah)\] /.test(x)), `každá položka má značku řezu a osud jako druhou značku: ${polozky}`)
    k.obsahuje(uz, '## Řez 05', 'nadpis řezu ve follow-ups'); k.obsahuje(uz, '[<osud>]', 'osud ve značce')
    k.obsahuje(uz, `rychlé kontroly nad celým stromem: ${RK}`, 'rychlé kontroly v uzavření')
    k.obsahuje(uz, 'kontroly pre-commit hooku projektu, které míří na dokumenty běhu v docs/', 'kontroly nad docs/ v uzavření')
    k.obsahuje(k.jeden('verify:řez 05:1'), 'které spouští až uzavření řezu', 'brána bez kontrol nad docs/')
    return k.chyby
  },
}

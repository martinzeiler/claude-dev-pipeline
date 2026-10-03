// 78 · kolečko · 1.5.0 (spec § 1.3, 1.4, 1.1): oprava thermo dostane soubory s nálezy i soubory jejich náprav; deploy kolečka měří
// diff od posledního zápisu nasazení (nasadí i aplikaci, kterou řez nenasadil; běh web-podzim řez 13), health začíná řádkem aplikací
// a čekání má strop 4,5 minuty na volání.
import { argsKolecko, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'kolečko: thermo s nápravami, deploy od báze',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'thermo:kolečko') return stub(label, { blokeru: 1, nalezu: 1, soubory: ['apps/a.ts'], napravy: [{ id: 'T1-78', soubory: ['packages/b.ts'] }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const th = k.jeden('thermo:kolečko')
    k.pole(th, ['napravy'], 'THERMO')
    const f = k.jeden('fix-thermo:kolečko')
    k.obsahuje(f, 'apps/a.ts'); k.obsahuje(f, 'packages/b.ts', 'soubor nápravy')
    const d = k.jeden('deploy:kolečko:1')
    k.obsahuje(d, "git log --grep 'zápis nasazení'", 'bázi diffu')
    k.obsahuje(d, 'aplikace: <app>', 'řádek aplikací v health')
    k.obsahuje(d, '4,5 minuty', 'strop čekacího volání')
    const x = volani.find(z => /do 10 minut|skončí sama? do 10 minut/.test(z.prompt))
    k.ok(!x, `zadání s čekáním do 10 minut: ${x && x.label}`)
    return k.chyby
  },
}

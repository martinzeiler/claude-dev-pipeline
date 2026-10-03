// 79 · stavba · 1.5.0: texty a schémata (spec § 1.1, 1.4, 1.5, 1.7): rámec se stropem čekání 4,5 minuty, nikde „do 10 minut“,
// deploy se čtyřmi stavy kroků a bází diffu, uzavření jako agent pluginu, popis pole predavka, bez mapy kostry žádný pokyn k ní.
import { argsStavby, kontrola, rozhrani } from '../stuby.mjs'

export default {
  nazev: 'stavba: texty a schémata 1.5.0',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const bez = (co, f) => { const xs = volani.filter(f).map(x => x.label); k.ok(!xs.length, `${co}: ${xs.join(', ')}`) }
    bez('rámec bez stropu čekání 4,5 minuty', x => !x.prompt.includes('Jedno čekací volání trvá nejvýš 4,5 minuty'))
    bez('zadání s čekáním do 10 minut', x => /do 10 minut/.test(x.prompt))
    bez('pokyn k mapě kostry bez mapy', x => x.prompt.includes('podle mapy'))
    const d = k.jeden('deploy:řez 05:1')
    if (d) {
      const e = d.schema.properties.kroky_po_nasazeni.items.properties.stav.enum
      k.rovno(e, ['provedeno', 'selhalo', 'vynechano', 'pro-majitele'], 'DEPLOY.kroky_po_nasazeni.stav')
      k.obsahuje(d, 'pro-majitele'); k.obsahuje(d, 'merge-base HEAD main', 'bázi bez zápisu nasazení')
      k.ok(/předchůdce/.test(d.schema.properties.predavka.description || ''), `PREDAVKA: ${d.schema.properties.predavka.description}`)
    }
    k.agent(k.jeden('uzavření:řez 05'), 'dev-pipeline:uzavreni', 'sonnet', 'medium')
    k.pole(k.jeden('thermo:řez 05'), ['napravy'], 'THERMO')
    rozhrani(k, volani)
    return k.chyby
  },
}

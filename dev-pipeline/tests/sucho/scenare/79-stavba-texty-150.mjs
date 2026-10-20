// 79 · stavba · 1.5.0: texty a schémata (spec § 1.1, 1.4, 1.5, 1.7): nikde „do 10 minut“ (čekání na proces je od 1.8.0 v TVAR-DOKUMENTU, ne v rámci),
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
    bez('rámec s čekací smyčkou (patří do TVAR-DOKUMENTU)', x => /run_in_background|4,5 minuty|seq 1 26/.test(x.prompt))
    bez('zadání s čekáním do 10 minut', x => /do 10 minut/.test(x.prompt))
    bez('pokyn k mapě kostry bez mapy', x => x.prompt.includes('podle mapy'))
    const d = k.jeden('deploy:řez 05:1')
    if (d) {
      const e = d.schema.properties.kroky_po_nasazeni.items.properties.stav.enum
      k.rovno(e, ['provedeno', 'selhalo', 'nevztahuje-se', 'vynechano', 'pro-majitele'], 'DEPLOY.kroky_po_nasazeni.stav')
      k.obsahuje(d, 'pro-majitele'); k.obsahuje(d, 'merge-base HEAD main', 'bázi bez zápisu nasazení')
      k.ok(/předchůdce/.test(d.schema.properties.predavka.description || ''), `PREDAVKA: ${d.schema.properties.predavka.description}`)
    }
    k.agent(k.jeden('uzavření:řez 05'), 'dev-pipeline:uzavreni', 'sonnet', 'medium')
    k.pole(k.jeden('thermo:řez 05'), ['napravy'], 'THERMO')
    rozhrani(k, volani)
    return k.chyby
  },
}

// 57 · stavba · doplnění revize (D): E2E dostane výsledky měřidel poslední zelené brány doslova, ne jen cestu k jejímu výstupu.
import { argsStavby, kontrola, zelenaBrana } from '../stuby.mjs'

const MERIDLO = 'AK3 · node scripts/pocet-57.mjs · 7 · ok'

export default {
  nazev: 'E2E dostane výsledky měřidel brány',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, prompt) {
    if (label === 'verify:řez 05:1') { const m = /ulož do (\S+?\.md)/.exec(prompt); return zelenaBrana({ meridla: [MERIDLO], ...(m ? { vystup_path: m[1] } : {}) }) }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.obsahuje(k.jeden('e2e:řez 05:1'), MERIDLO, 'výsledek měřidla brány')
    return k.chyby
  },
}

import type { NextConfig } from 'next'

const config: NextConfig = {
  // Les paquets du workspace sont publies en TypeScript source (main: ./src/index.ts) :
  // Next doit les transpiler lui-meme plutot que d'attendre du JS compile.
  transpilePackages: ['@homebudget/domain', '@homebudget/db'],
  webpack: (config) => {
    // Les paquets du workspace suivent la convention ESM `NodeNext` : un import
    // `./foo.js` designe en realite `./foo.ts` (le `.js` est l'extension de sortie
    // attendue une fois compile, pas le nom du fichier source). Node et Vitest
    // resolvent ca nativement ; le resolver webpack de Next ne le fait pas par
    // defaut et il faut le lui dire explicitement via `extensionAlias`.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
}

export default config

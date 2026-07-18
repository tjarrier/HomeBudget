import type { NextConfig } from 'next'

const config: NextConfig = {
  // Les paquets du workspace sont publies en TypeScript source (main: ./src/index.ts) :
  // Next doit les transpiler lui-meme plutot que d'attendre du JS compile.
  transpilePackages: ['@homebudget/domain', '@homebudget/db'],
}

export default config

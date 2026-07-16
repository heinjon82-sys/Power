# Punttis PWA

Offline-first treeniseuranta Reactilla, IndexedDB:llä ja Cloudflare Workers/D1:llä.

## Kehitys

```sh
npm install
npm run dev
npm test
npm run build
```

## Cloudflare-julkaisu

1. Luo D1-tietokanta: `npx wrangler d1 create punttis` ja korvaa sen tunniste `wrangler.jsonc`-tiedostoon.
2. Luo R2-bucket: `npx wrangler r2 bucket create punttis-media`.
3. Aja skeema: `npm run cf:migrate`.
4. Julkaise: `npm run cf:deploy`.
5. Cloudflare Zero Trustissa suojaa Worker nimellä, käytä Cloudflare-identiteettipalvelua ja rajoita pääsy omaan tilijäsenyyteesi.

Ensimmäinen kirjautunut sovelluskäyttö lähettää liikepankin D1:een automaattisesti. Tämä tehdään ennen ensimmäisen ohjelman synkronointia.

## Liikekuvat

`Kuvat/` sisältää tällä hetkellä numeerisesti nimetyt lähdekuvat. Niitä ei yhdistetä liikkeisiin arvaamalla. Tee `scripts/exercise-image-map.json` ja suorita `npm run images:prepare`. Syntyvät 128px WebP-kuvat kuuluvat PWA:n offline-assettiin; 600px WebP-kuvat viedään R2:een avaimella `exercise-id.webp`.

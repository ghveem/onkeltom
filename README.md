# NDLA bulk image uploader (React + Vite)

Liten React-app for GitHub Pages som laster opp mange bilder til NDLA sitt image-api.

## Innhold

- Kun miljøene **test** og **staging**
- Google-innlogging via Auth0 SPA SDK
- Felles metadata + per-bilde overstyringer
- Tittel hentes fra filnavn som standard
- Auto-tagging fra filnavn
- Drag & drop + manuell sortering
- Thumbnails og metadata-preview
- Batch-redigering for valgte bilder
- Køstyrt parallell opplasting med enkel rate limiting
- Fremdriftsindikator og feillogg
- Nytt forsøk på bare feilede bilder
- Valgfri automatisk serieopprettelse før opplasting

## Oppsett

1. Kopier `config.example.js` til `config.js` hvis du vil starte på nytt.
2. Fyll inn `clientId` for `test` og `staging`.
3. Bekreft `audience`-verdiene med NDLA/Auth0.
4. Sett callback/logout URL i Auth0 til GitHub Pages-URLen din.
5. Installer og bygg:

```bash
npm install
npm run build
```

6. Publiser `dist/` til GitHub Pages.

## Viktig om serieopprettelse

Appen er satt opp med `createSeriesPath: '/image-api/v3/series'` i config. Selve opplastings-endpointet for bilder er bekreftet, men serie-endpointet bør verifiseres mot deres test/staging-miljø før første bruk. Hvis serieopprettelse feiler, får du tydelig feilmelding og kan justere config/oppsett før du prøver på nytt.

## Forventet config-format

```js
window.NDLA_UPLOADER_CONFIG = {
  defaultEnvironment: 'test',
  upload: {
    maxConcurrent: 3,
    delayMs: 300,
    retryAttempts: 2,
  },
  envs: {
    test: {
      label: 'Test',
      apiBase: 'https://api.test.ndla.no',
      auth0Domain: 'ndla.eu.auth0.com',
      clientId: 'SET_TEST_CLIENT_ID',
      audience: 'https://api.test.ndla.no',
      connection: 'google-oauth2',
      scopes: 'openid profile email images:write'
    },
    staging: {
      label: 'Staging',
      apiBase: 'https://api.staging.ndla.no',
      auth0Domain: 'ndla.eu.auth0.com',
      clientId: 'SET_STAGING_CLIENT_ID',
      audience: 'https://api.staging.ndla.no',
      connection: 'google-oauth2',
      scopes: 'openid profile email images:write'
    }
  },
  endpoints: {
    uploadPath: '/image-api/v3/images',
    createSeriesPath: '/image-api/v3/series'
  }
};
```

## Notater

- Upload går mot `POST /image-api/v3/images` med `multipart/form-data` (`file` + `metadata`).
- Metadataobjektet i preview-panelet viser hva som sendes per bilde.
- `imageSeriesId` sendes bare hvis serieopprettelse er slått på og lykkes.

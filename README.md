# NDLA bildebatch-opplaster for GitHub Pages

Statisk frontend for opplasting av mange bilder til NDLA sitt image-api.

## Innhold

- miljøvalg for **test** og **staging**
- Google-innlogging via Auth0 i nettleseren
- opplasting til `POST /image-api/v3/images`
- `title` hentes automatisk fra filnavn
- **serienavn** lagres som nøkkelord/tag
- drag & drop + sortering
- thumbnails
- batch-redigering per bilde
- fremdriftsindikator
- retry av feilede filer

## Før deploy

1. Kopier inn riktig verdier i `config.js`
2. Opprett eller konfigurer Auth0-applikasjon for begge miljøene
3. Legg GitHub Pages-URL-en inn som:
   - Allowed Callback URLs
   - Allowed Logout URLs
   - Allowed Web Origins
4. Sjekk at NDLA-miljøene tillater CORS fra GitHub Pages-domenet ditt

## Deploy til GitHub Pages

1. Opprett et repo
2. Last opp alle filene i denne mappen
3. Gå til **Settings → Pages**
4. Velg branch `main` og `/root`
5. Vent til siden er publisert

## Konfig

Rediger `config.js`:

```js
window.NDLA_CONFIG = {
  defaultEnvironment: "test",
  environments: {
    test: {
      label: "Test",
      apiBaseUrl: "https://api.test.ndla.no",
      imageUploadPath: "/image-api/v3/images",
      auth0Domain: "ndla.eu.auth0.com",
      auth0ClientId: "DIN_TEST_CLIENT_ID",
      auth0Audience: "https://api.test.ndla.no",
      scope: "openid profile email images:write",
      googleConnection: "google-oauth2"
    },
    staging: {
      label: "Staging",
      apiBaseUrl: "https://api.staging.ndla.no",
      imageUploadPath: "/image-api/v3/images",
      auth0Domain: "ndla.eu.auth0.com",
      auth0ClientId: "DIN_STAGING_CLIENT_ID",
      auth0Audience: "https://api.staging.ndla.no",
      scope: "openid profile email images:write",
      googleConnection: "google-oauth2"
    }
  }
};
```

## Metadata

Appen bygger metadata per fil slik:

- `title`: fra filnavn
- `caption`: felles verdi eller overstyrt per bilde
- `alttext`: felles verdi eller overstyrt per bilde
- `tags`: felles tags + auto-tags fra filnavn + serienavn
- `copyright.license.license`
- `copyright.license.description`
- `copyright.origin`
- `copyright.creators`
- `copyright.processors`
- `copyright.rightsholders`
- `copyright.processed`
- `language`
- `modelReleased`

## Tips

- Bruk **Forhåndsvis payload** før første opplasting
- La serienavn være kort og stabilt, siden det legges på alle bilder som keyword
- Hvis noen filer feiler, bruk **Prøv feilede på nytt**


## GitHub Secrets og runtime-config

GitHub Pages kan ikke holde ekte hemmeligheter skjult i frontend-koden. I denne appen er `auth0ClientId`, `audience` og `domain` normalt offentlige OAuth-verdier, så de kan ligge i `config.js`.

Hvis du likevel vil styre dem via GitHub, følger det med en workflow i `.github/workflows/deploy.yml` som skriver `runtime-config.js` under deploy.

Legg inn disse i repoet:

### Secrets
- `NDLA_AUTH0_TEST_CLIENT_ID`
- `NDLA_AUTH0_STAGING_CLIENT_ID`

### Variables
- `NDLA_AUTH0_TEST_AUDIENCE` (valgfri, standard `https://api.test.ndla.no`)
- `NDLA_AUTH0_STAGING_AUDIENCE` (valgfri, standard `https://api.staging.ndla.no`)

Appen leser først `config.js`, og overstyrer deretter med `runtime-config.js` hvis den finnes.

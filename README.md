# NDLA bildebatch-opplaster

Liten statisk webapp for GitHub Pages som lar deg:

- logge inn via Auth0/Google
- velge mange bilder samtidig
- fylle inn felles metadata én gang
- generere `title` fra filnavnet på hvert bilde
- laste opp ett og ett bilde til NDLA sitt image-api

## Hva appen bygger på

NDLA sitt image-api dokumenterer at:

- opplasting skjer mot `POST /image-api/v3/images`
- opplastingen bruker `multipart/form-data`
- skjemaet heter `MetaDataAndFileForm`
- det krever OAuth-scope `images:write`
- OAuth er satt opp med `authorizationUrl` hos `https://ndla.eu.auth0.com/authorize`

Denne appen sender derfor:

- `metadata` som JSON
- `file` som binærfil

## Filer

- `index.html` – appen
- `styles.css` – stil
- `app.js` – auth + opplasting
- `config.example.js` – kopieres til `config.js`

## Før du kjører

1. Kopier `config.example.js` til `config.js`
2. Fyll inn riktig Auth0-/NDLA-konfigurasjon:

```js
window.NDLA_CONFIG = {
  auth0Domain: "ndla.eu.auth0.com",
  auth0ClientId: "DIN_CLIENT_ID",
  auth0Audience: "DIN_AUDIENCE",
  apiBaseUrl: "https://api.ndla.no",
  imageUploadPath: "/image-api/v3/images",
  scope: "openid profile email images:write",
  googleConnection: "google-oauth2"
};
```

## Lokalt

Kjør appen via en enkel lokal webserver:

```bash
python3 -m http.server 8080
```

Åpne så `http://localhost:8080`.

## GitHub Pages

1. Legg filene i et repo
2. Legg til `config.js` i repoet ditt
3. Aktiver GitHub Pages for branchen din
4. Legg GitHub Pages-URL-en inn som tillatt callback URL i Auth0

Eksempel på callback URL:

- `https://brukernavn.github.io/repo-navn/`

## Metadataformat

Appen bygger metadata slik:

```json
{
  "title": "hentet fra filnavn",
  "alttext": "...",
  "caption": "...",
  "tags": ["tag1", "tag2"],
  "language": "nb",
  "modelReleased": "not-set",
  "copyright": {
    "license": {
      "license": "CC-BY-4.0",
      "description": "...",
      "url": "https://..."
    },
    "origin": "...",
    "creators": [{ "type": "photographer", "name": "Navn" }],
    "processors": [],
    "rightsholders": [],
    "processed": false
  }
}
```

## Tittel fra filnavn

`IMG_001-oversikt.png` blir til:

`IMG 001 oversikt`

Regler:

- filendelse fjernes
- `_` og `-` erstattes med mellomrom
- flere mellomrom komprimeres

## Viktig om designmanualen

Denne versjonen er laget som en helt statisk app for GitHub Pages, og har derfor NDLA-inspirert utseende heller enn direkte import av hele `@ndla/ui`-biblioteket.

Hvis du vil ha en React/Vite-versjon som bruker offisielle NDLA-komponenter direkte, kan denne løsningen brukes som fungerende prototype og deretter bygges om til `@ndla/ui`.

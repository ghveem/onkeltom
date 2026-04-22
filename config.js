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
    // Bekreft denne mot deres miljø hvis den avviker.
    createSeriesPath: '/image-api/v3/series'
  },
  licenseOptions: [
    { value: 'CC-BY-4.0', label: 'CC BY 4.0', description: 'Creative Commons Attribution 4.0 International' },
    { value: 'CC-BY-SA-4.0', label: 'CC BY-SA 4.0', description: 'Creative Commons Attribution-ShareAlike 4.0 International' },
    { value: 'CC-BY-NC-4.0', label: 'CC BY-NC 4.0', description: 'Creative Commons Attribution-NonCommercial 4.0 International' },
    { value: 'CC-BY-NC-SA-4.0', label: 'CC BY-NC-SA 4.0', description: 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International' },
    { value: 'CC-BY-NC-ND-4.0', label: 'CC BY-NC-ND 4.0', description: 'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International' },
    { value: 'COPYRIGHTED', label: 'Copyrighted', description: 'All rights reserved / opphavsrettsbeskyttet' }
  ]
};

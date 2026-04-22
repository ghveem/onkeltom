window.NDLA_CONFIG = {
  defaultEnvironment: "test",
  environments: {
    test: {
      label: "Test",
      apiBaseUrl: "https://api.test.ndla.no",
      imageUploadPath: "/image-api/v3/images",
      auth0Domain: "ndla.eu.auth0.com",
      auth0ClientId: "SETT_INN_TEST_CLIENT_ID",
      auth0Audience: "https://api.test.ndla.no",
      scope: "openid profile email images:write",
      googleConnection: "google-oauth2"
    },
    staging: {
      label: "Staging",
      apiBaseUrl: "https://api.staging.ndla.no",
      imageUploadPath: "/image-api/v3/images",
      auth0Domain: "ndla.eu.auth0.com",
      auth0ClientId: "SETT_INN_STAGING_CLIENT_ID",
      auth0Audience: "https://api.staging.ndla.no",
      scope: "openid profile email images:write",
      googleConnection: "google-oauth2"
    }
  }
};

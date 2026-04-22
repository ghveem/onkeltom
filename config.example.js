window.NDLA_CONFIG = {
  defaultEnvironment: "test",
  environments: {
    test: {
      label: "Test",
      auth0Domain: "ndla.eu.auth0.com",
      auth0ClientId: "SETT_INN_TEST_CLIENT_ID",
      auth0Audience: "SETT_INN_TEST_AUDIENCE",
      apiBaseUrl: "https://api.test.ndla.no",
      imageUploadPath: "/image-api/v3/images",
      scope: "openid profile email images:write",
      googleConnection: "google-oauth2"
    },
    prod: {
      label: "Produksjon",
      auth0Domain: "ndla.eu.auth0.com",
      auth0ClientId: "SETT_INN_PROD_CLIENT_ID",
      auth0Audience: "SETT_INN_PROD_AUDIENCE",
      apiBaseUrl: "https://api.ndla.no",
      imageUploadPath: "/image-api/v3/images",
      scope: "openid profile email images:write",
      googleConnection: "google-oauth2"
    }
  }
};

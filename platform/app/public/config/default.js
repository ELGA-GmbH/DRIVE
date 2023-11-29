window.config = {
  routerBasename: '/',
  customizationService: {},
  showStudyList: true,
  showBackButton: false,
  extensions: [],
  modes: [],
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  defaultDataSourceName: 'dicomweb',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'DCM4CHEE Server',
        name: 'DCM4CHEE',
        // wadoUriRoot: 'http://192.168.102.141:8080/dcm4chee-arc/aets/DCM4CHEE/wado',
        // qidoRoot: 'http://192.168.102.141:8080/dcm4chee-arc/aets/DCM4CHEE/rs',
        qidoRoot: '/dcmweb/qido',
        //wadoRoot: 'http://192.168.102.141:8080/dcm4chee-arc/aets/DCM4CHEE/rs',
        wadoRoot: '/dcmweb/dicom-web/wado',
        qidoSupportsIncludeField: true,
        imageRendering: 'wadors',
        enableStudyLazyLoad: true,
        thumbnailRendering: 'wadors',
        dicomUploadEnabled: false,
        singlepart: 'pdf,video',
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
        },
        omitQuotationForMultipartRequest: true,
      },
    },
  ],
  elgaSettings: {
    TokenType: 'IHE-HCP',
    PatientIdNeeded: true,
    TokenNeeded: true,
    RemoveTokenFromURLOnceLoadedIntoState: false,
  },
  studyListFunctionsEnabled: false,
};

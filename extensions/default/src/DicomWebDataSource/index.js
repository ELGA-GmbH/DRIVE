import { api } from 'dicomweb-client';
import { DicomMetadataStore, IWebApiDataSource, utils, errorHandler, classes } from '@ohif/core';

import {
  mapParams,
  search as qidoSearch,
  seriesInStudy,
  processResults,
  processSeriesResults,
} from './qido.js';

import dcm4cheeReject from './dcm4cheeReject';

import getImageId from './utils/getImageId';
import dcmjs from 'dcmjs';
import { retrieveStudyMetadata, deleteStudyMetadataPromise } from './retrieveStudyMetadata.js';
import { queryInstances, deleteQueryInstancesPromise } from './queryInstances.js';
import StaticWadoClient from './utils/StaticWadoClient';
import getDirectURL from '../utils/getDirectURL';
import { fixBulkDataURI } from './utils/fixBulkDataURI';

const { DicomMetaDictionary, DicomDict } = dcmjs.data;

const { naturalizeDataset, denaturalizeDataset } = DicomMetaDictionary;

const ImplementationClassUID = '2.25.270695996825855179949881587723571202391.2.0.0';
const ImplementationVersionName = 'OHIF-VIEWER-2.0.0';
const EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';

const metadataProvider = classes.MetadataProvider;

/**
 *
 * @param {string} name - Data source name
 * @param {string} wadoUriRoot - Legacy? (potentially unused/replaced)
 * @param {string} qidoRoot - Base URL to use for QIDO requests
 * @param {string} wadoRoot - Base URL to use for WADO requests
 * @param {boolean} qidoSupportsIncludeField - Whether QIDO supports the "Include" option to request additional fields in response
 * @param {string} imageRengering - wadors | ? (unsure of where/how this is used)
 * @param {string} thumbnailRendering - wadors | ? (unsure of where/how this is used)
 * @param {bool} supportsReject - Whether the server supports reject calls (i.e. DCM4CHEE)
 * @param {bool} lazyLoadStudy - "enableStudyLazyLoad"; Request series meta async instead of blocking
 * @param {string|bool} singlepart - indicates of the retrieves can fetch singlepart.  Options are bulkdata, video, image or boolean true
 */
function createDicomWebApi(dicomWebConfig, userAuthenticationService) {
  let dicomWebConfigCopy,
    qidoConfig,
    wadoConfig,
    qidoDicomWebClient,
    wadoDicomWebClient,
    getAuthrorizationHeader,
    generateWadoHeader;

  const implementation = {
    initialize: ({ params, query }) => {
      console.log('MyLog, createDicomWebApi', dicomWebConfigCopy, window.location.search);
      if (dicomWebConfig.onConfiguration && typeof dicomWebConfig.onConfiguration === 'function') {
        dicomWebConfig = dicomWebConfig.onConfiguration(dicomWebConfig, {
          params,
          query,
        });
      }

      dicomWebConfigCopy = JSON.parse(JSON.stringify(dicomWebConfig));

      getAuthrorizationHeader = () => {
        const xhrRequestHeaders = {};
        const authHeaders = userAuthenticationService.getAuthorizationHeader();
        if (authHeaders && authHeaders.Authorization) {
          xhrRequestHeaders.Authorization = authHeaders.Authorization;
        }
        return xhrRequestHeaders;
      };

      generateWadoHeader = () => {
        let authorizationHeader = getAuthrorizationHeader();

        //Generate accept header depending on config params
        let formattedAcceptHeader = utils.generateAcceptHeader(
          dicomWebConfig.acceptHeader,
          dicomWebConfig.requestTransferSyntaxUID,
          dicomWebConfig.omitQuotationForMultipartRequest
        );
        return {
          ...authorizationHeader,
          Accept: formattedAcceptHeader,
        };
      };

      qidoConfig = {
        url: dicomWebConfig.qidoRoot,
        staticWado: dicomWebConfig.staticWado,
        singlepart: dicomWebConfig.singlepart,
        headers: userAuthenticationService.getAuthorizationHeader(),
        errorInterceptor: errorHandler.getHTTPErrorHandler(),
      };

      wadoConfig = {
        url: dicomWebConfig.wadoRoot,
        staticWado: dicomWebConfig.staticWado,
        singlepart: dicomWebConfig.singlepart,
        headers: userAuthenticationService.getAuthorizationHeader(),
        errorInterceptor: errorHandler.getHTTPErrorHandler(),
      };
      console.log(
        'MyLog, dicomWebDataSource, WADO',
        wadoConfig,
        qidoConfig,
        window.location.search
      );
      // TODO -> Two clients sucks, but its better than 1000.
      // TODO -> We'll need to merge auth later.
      qidoDicomWebClient = dicomWebConfig.staticWado
        ? new StaticWadoClient(qidoConfig)
        : new api.DICOMwebClient(qidoConfig);

      wadoDicomWebClient = dicomWebConfig.staticWado
        ? new StaticWadoClient(wadoConfig)
        : new api.DICOMwebClient(wadoConfig);
    },
    query: {
      studies: {
        mapParams: mapParams.bind(),
        search: async function (origParams) {
          const authHeader = getAuthrorizationHeader();

          console.log('MyLog Search query', origParams);
          qidoDicomWebClient.headers = authHeader;

          const { studyInstanceUid, seriesInstanceUid, ...mappedParams } =
            mapParams(origParams, {
              supportsFuzzyMatching: dicomWebConfig.supportsFuzzyMatching,
              supportsWildcard: dicomWebConfig.supportsWildcard,
            }) || {};
          console.log('MyLog Search query', mappedParams);

          const results = await qidoSearch(qidoDicomWebClient, undefined, undefined, mappedParams);

          const proc = processResults(results);
          console.log('MyLog Search query results', proc);
          wadoConfig.url = proc.map(x => x.retrieveURL.replace(/studies\/[0-9\.]{1,}.*/gm, ''))[0];
          return proc;
        },
        processResults: processResults.bind(),
      },
      series: {
        mapParams: mapParams.bind(),
        // mapParams: mapParams.bind(),
        search: async function (studyInstanceUid, origParams) {
          const authHeader = getAuthrorizationHeader();
          console.log('MyLog, Search Series query', origParams, authHeader);
          const { ...mappedParams } =
            mapParams(origParams, {
              supportsFuzzyMatching: dicomWebConfig.supportsFuzzyMatching,
              supportsWildcard: dicomWebConfig.supportsWildcard,
            }) || {};
          const results = await seriesInStudy(qidoDicomWebClient, studyInstanceUid);
          const proc = processResults(results);
          console.log('MyLog, ', proc, results);
          wadoConfig.url = proc.map(x => x.retrieveURL.replace(/studies\/[0-9\.]{1,}.*/gm, ''))[0];
          return processSeriesResults(results);
        },
        // processResults: processResults.bind(),
      },
      instances: {
        search: (studyInstanceUid, queryParameters) => {
          qidoDicomWebClient.headers = getAuthrorizationHeader();
          qidoSearch.call(undefined, qidoDicomWebClient, studyInstanceUid, null, queryParameters);
        },
        get: async ({
          StudyInstanceUID,
          filters,
          sortCriteria,
          sortFunction,
          madeInClient = false,
        } = {}) => {
          if (!StudyInstanceUID) {
            throw new Error('Unable to query for SeriesMetadata without StudyInstanceUID');
          }
          if (dicomWebConfig.enableStudyLazyLoad) {
            console.log('MyLOG - Retrieve metadata - async');
            return implementation._queryInstancesAsync(
              StudyInstanceUID,
              filters,
              sortCriteria,
              sortFunction,
              madeInClient
            );
          }

          console.log('MyLOG - Retrieve metadata - sync');
          return implementation._queryInstancesSync(
            StudyInstanceUID,
            filters,
            sortCriteria,
            sortFunction,
            madeInClient
          );
        },
      },
    },
    retrieve: {
      /**
       * Generates a URL that can be used for direct retrieve of the bulkdata
       *
       * @param {object} params
       * @param {string} params.tag is the tag name of the URL to retrieve
       * @param {object} params.instance is the instance object that the tag is in
       * @param {string} params.defaultType is the mime type of the response
       * @param {string} params.singlepart is the type of the part to retrieve
       * @returns an absolute URL to the resource, if the absolute URL can be retrieved as singlepart,
       *    or is already retrieved, or a promise to a URL for such use if a BulkDataURI
       */
      directURL: params => {
        return getDirectURL(
          {
            wadoRoot: dicomWebConfig.wadoRoot,
            singlepart: dicomWebConfig.singlepart,
          },
          params
        );
      },
      bulkDataURI: async ({ StudyInstanceUID, BulkDataURI }) => {
        qidoDicomWebClient.headers = getAuthrorizationHeader();
        const options = {
          multipart: false,
          BulkDataURI,
          StudyInstanceUID,
        };
        return qidoDicomWebClient.retrieveBulkData(options).then(val => {
          const ret = (val && val[0]) || undefined;
          return ret;
        });
      },
      series: {
        metadata: async ({
          StudyInstanceUID,
          filters,
          sortCriteria,
          sortFunction,
          madeInClient = false,
        } = {}) => {
          console.log('MyLog, RetrieveMetadata DicomWeb Datasource gtet data, filters', filters);
          if (!StudyInstanceUID) {
            throw new Error('Unable to query for SeriesMetadata without StudyInstanceUID');
          }
          if (dicomWebConfig.enableStudyLazyLoad) {
            return implementation._retrieveSeriesMetadataAsync(
              StudyInstanceUID,
              filters,
              sortCriteria,
              sortFunction,
              madeInClient
            );
          }

          return implementation._retrieveSeriesMetadataSync(
            StudyInstanceUID,
            filters,
            sortCriteria,
            sortFunction,
            madeInClient
          );
        },
      },
    },

    store: {
      dicom: async (dataset, request) => {
        console.log('MyLog, store', dataset, request);
        wadoDicomWebClient.headers = getAuthrorizationHeader();
        if (dataset instanceof ArrayBuffer) {
          const options = {
            datasets: [dataset],
            request,
          };
          console.log('MyLog, store', options);
          await wadoDicomWebClient.storeInstances(options);
        } else {
          const meta = {
            FileMetaInformationVersion: dataset._meta.FileMetaInformationVersion.Value,
            MediaStorageSOPClassUID: dataset.SOPClassUID,
            MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
            TransferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN,
            ImplementationClassUID,
            ImplementationVersionName,
          };

          const denaturalized = denaturalizeDataset(meta);
          const dicomDict = new DicomDict(denaturalized);

          dicomDict.dict = denaturalizeDataset(dataset);

          const part10Buffer = dicomDict.write();

          const options = {
            datasets: [part10Buffer],
            request,
          };
          console.log('MyLog, store', options);
          await wadoDicomWebClient.storeInstances(options);
        }
      },
    },
    _queryInstancesSync: async (
      StudyInstanceUID,
      filters,
      sortCriteria,
      sortFunction,
      madeInClient
    ) => {
      const enableStudyLazyLoad = false;
      wadoDicomWebClient.headers = generateWadoHeader();
      // data is all SOPInstanceUIDs
      console.log('MyLog, WAdo _retrieveSeriesMetadataSync', wadoDicomWebClient);
      const data = await retrieveStudyMetadata(
        wadoDicomWebClient,
        StudyInstanceUID,
        enableStudyLazyLoad,
        filters,
        sortCriteria,
        sortFunction
      );

      // first naturalize the data
      const naturalizedInstancesMetadata = data.map(naturalizeDataset);

      const seriesSummaryMetadata = {};
      const instancesPerSeries = {};

      naturalizedInstancesMetadata.forEach(instance => {
        if (!seriesSummaryMetadata[instance.SeriesInstanceUID]) {
          seriesSummaryMetadata[instance.SeriesInstanceUID] = {
            StudyInstanceUID: instance.StudyInstanceUID,
            StudyDescription: instance.StudyDescription,
            SeriesInstanceUID: instance.SeriesInstanceUID,
            SeriesDescription: instance.SeriesDescription,
            SeriesNumber: instance.SeriesNumber,
            SeriesTime: instance.SeriesTime,
            SOPClassUID: instance.SOPClassUID,
            ProtocolName: instance.ProtocolName,
            Modality: instance.Modality,
          };
        }

        if (!instancesPerSeries[instance.SeriesInstanceUID]) {
          instancesPerSeries[instance.SeriesInstanceUID] = [];
        }

        const imageId = implementation.getImageIdsForInstance({
          instance,
        });

        instance.imageId = imageId;

        metadataProvider.addImageIdToUIDs(imageId, {
          StudyInstanceUID,
          SeriesInstanceUID: instance.SeriesInstanceUID,
          SOPInstanceUID: instance.SOPInstanceUID,
        });

        instancesPerSeries[instance.SeriesInstanceUID].push(instance);
      });

      // grab all the series metadata
      const seriesMetadata = Object.values(seriesSummaryMetadata);
      DicomMetadataStore.addSeriesMetadata(seriesMetadata, madeInClient);

      Object.keys(instancesPerSeries).forEach(seriesInstanceUID =>
        DicomMetadataStore.addInstances(instancesPerSeries[seriesInstanceUID], madeInClient)
      );
      console.log('MyLog, Wado seriesMetadata', seriesMetadata);
    },

    _queryInstancesAsync: async (
      StudyInstanceUID,
      filters,
      sortCriteria,
      sortFunction,
      madeInClient = false
    ) => {
      const enableStudyLazyLoad = true;
      wadoDicomWebClient.headers = generateWadoHeader();
      wadoDicomWebClient.qidoURL = qidoConfig.url;
      wadoDicomWebClient.wadoURL = wadoConfig.url;
      wadoDicomWebClient.baseURL = wadoConfig.url;
      // Get Series
      console.log('MyLog, Wado _queryInstancesAsync', wadoDicomWebClient);
      const { preLoadData: seriesSummaryMetadata, promises: seriesPromises } = await queryInstances(
        qidoDicomWebClient,
        StudyInstanceUID,
        enableStudyLazyLoad,
        filters,
        sortCriteria,
        sortFunction
      );
      // console.log('MyLog, Wado _retrieveSeriesMetadataAsync', seriesSummaryMetadata);
      /**
       * naturalizes the dataset, and adds a retrieve bulkdata method
       * to any values containing BulkDataURI.
       * @param {*} instance
       * @returns naturalized dataset, with retrieveBulkData methods
       */
      const addRetrieveBulkData = instance => {
        const naturalized = naturalizeDataset(instance);

        // if we know the server doesn't use bulkDataURI, then don't
        if (!dicomWebConfig.bulkDataURI?.enabled) {
          return naturalized;
        }

        Object.keys(naturalized).forEach(key => {
          const value = naturalized[key];
          // console.log(
          //   'MyLog, Wado _retrieveSeriesMetadataAsync,addRetrieveBulkData',
          //   value,
          //   value && value.BulkDataURI && !value.Value
          // );
          // The value.Value will be set with the bulkdata read value
          // in which case it isn't necessary to re-read this.
          if (value && value.BulkDataURI && !value.Value) {
            // Provide a method to fetch bulkdata
            value.retrieveBulkData = () => {
              // handle the scenarios where bulkDataURI is relative path
              fixBulkDataURI(value, naturalized, dicomWebConfig);

              const options = {
                // The bulkdata fetches work with either multipart or
                // singlepart, so set multipart to false to let the server
                // decide which type to respond with.
                multipart: false,
                BulkDataURI: value.BulkDataURI,
                // The study instance UID is required if the bulkdata uri
                // is relative - that isn't disallowed by DICOMweb, but
                // isn't well specified in the standard, but is needed in
                // any implementation that stores static copies of the metadata
                StudyInstanceUID: naturalized.StudyInstanceUID,
              };

              // Todo: this needs to be from wado dicom web client
              return qidoDicomWebClient.retrieveBulkData(options).then(val => {
                // There are DICOM PDF cases where the first ArrayBuffer in the array is
                // the bulk data and DICOM video cases where the second ArrayBuffer is
                // the bulk data. Here we play it safe and do a find.
                const ret =
                  (val instanceof Array && val.find(arrayBuffer => arrayBuffer?.byteLength)) ||
                  undefined;
                value.Value = ret;
                return ret;
              });
            };
          }
        });
        console.log(naturalized.RetrieveURL);
        return naturalized;
      };

      // Async load series, store as retrieved
      function storeInstances(naturalizedInstances) {
        // Adding instanceMetadata to OHIF MetadataProvider
        naturalizedInstances.forEach((instance, index) => {
          console.log('MyLog , naturalizedInstances,', instance, dicomWebConfig.wadoRoot);

          const imageId = implementation.getImageIdsForInstance({
            instance,
          });
          // Adding imageId to each instance
          // Todo: This is not the best way I can think of to let external
          // metadata handlers know about the imageId that is stored in the store
          instance.imageId = imageId;

          // Adding UIDs to metadataProvider
          // Note: storing imageURI in metadataProvider since stack viewports
          // will use the same imageURI
          console.log('MyLog , naturalizedInstances,metadataProvider', metadataProvider);

          metadataProvider.addImageIdToUIDs(imageId, {
            StudyInstanceUID,
            SeriesInstanceUID: instance.SeriesInstanceUID,
            SOPInstanceUID: instance.SOPInstanceUID,
          });
        });

        DicomMetadataStore.addInstances(naturalizedInstances, madeInClient);
      }

      function setSuccessFlag() {
        console.log('MyLog, Wado _retrieveSeriesMetadataAsync,setSuccessFlag');
        const study = DicomMetadataStore.getStudy(StudyInstanceUID, madeInClient);
        study.isLoaded = true;
      }

      // Google Cloud Healthcare doesn't return StudyInstanceUID, so we need to add
      // it manually here
      seriesSummaryMetadata.forEach(aSeries => {
        aSeries.StudyInstanceUID = StudyInstanceUID;
      });

      DicomMetadataStore.addSeriesMetadata(seriesSummaryMetadata, madeInClient);
      const seriesDeliveredPromises = await Promise.all(
        seriesPromises.map(async promise => {
          const qidoinstances = await promise;
          const naturalizedQuidoInstances = qidoinstances.map(e => addRetrieveBulkData(e));

          const baseURL = naturalizedQuidoInstances[0].RetrieveURL.replace(
            /\/studies\/[0-9\.]{1,}.*/gm,
            ''
          );
          if (dicomWebConfig.wadoRoot !== baseURL) {
            dicomWebConfig.wadoRoot = baseURL;
            wadoDicomWebClient.wadoURL = baseURL;
          }
          let FullMetadataList = [];
          const wadoMetadata = await Promise.all(
            naturalizedQuidoInstances.map(async x => {
              try {
                const y = await wadoDicomWebClient.retrieveInstanceMetadata({
                  studyInstanceUID: x.StudyInstanceUID,
                  seriesInstanceUID: x.SeriesInstanceUID,
                  sopInstanceUID: x.SOPInstanceUID,
                });
                console.log('metadataPromiseDone');
                const naturalizedWadoMetadata = y.map(e => addRetrieveBulkData(e));
                if (naturalizedWadoMetadata.length === 1) {
                  FullMetadataList.push(naturalizedWadoMetadata[0]);
                }
                return y;
              } catch (ex) {
                console.error('Error', ex);
                return null;
              }
            })
          );

          console.log('FullMetadataList', FullMetadataList);
          storeInstances(FullMetadataList);
        })
      );
      await Promise.all(seriesDeliveredPromises);
      console.log('seriesDeliveredPromises', seriesDeliveredPromises);
      setSuccessFlag();
    },
    _retrieveSeriesMetadataSync: async (
      StudyInstanceUID,
      filters,
      sortCriteria,
      sortFunction,
      madeInClient
    ) => {
      const enableStudyLazyLoad = false;
      wadoDicomWebClient.headers = generateWadoHeader();
      // data is all SOPInstanceUIDs
      console.log('MyLog, WAdo _retrieveSeriesMetadataSync', wadoDicomWebClient);
      const data = await retrieveStudyMetadata(
        wadoDicomWebClient,
        StudyInstanceUID,
        enableStudyLazyLoad,
        filters,
        sortCriteria,
        sortFunction
      );

      // first naturalize the data
      const naturalizedInstancesMetadata = data.map(naturalizeDataset);

      const seriesSummaryMetadata = {};
      const instancesPerSeries = {};

      naturalizedInstancesMetadata.forEach(instance => {
        if (!seriesSummaryMetadata[instance.SeriesInstanceUID]) {
          seriesSummaryMetadata[instance.SeriesInstanceUID] = {
            StudyInstanceUID: instance.StudyInstanceUID,
            StudyDescription: instance.StudyDescription,
            SeriesInstanceUID: instance.SeriesInstanceUID,
            SeriesDescription: instance.SeriesDescription,
            SeriesNumber: instance.SeriesNumber,
            SeriesTime: instance.SeriesTime,
            SOPClassUID: instance.SOPClassUID,
            ProtocolName: instance.ProtocolName,
            Modality: instance.Modality,
          };
        }

        if (!instancesPerSeries[instance.SeriesInstanceUID]) {
          instancesPerSeries[instance.SeriesInstanceUID] = [];
        }

        const imageId = implementation.getImageIdsForInstance({
          instance,
        });

        instance.imageId = imageId;

        metadataProvider.addImageIdToUIDs(imageId, {
          StudyInstanceUID,
          SeriesInstanceUID: instance.SeriesInstanceUID,
          SOPInstanceUID: instance.SOPInstanceUID,
        });

        instancesPerSeries[instance.SeriesInstanceUID].push(instance);
      });

      // grab all the series metadata
      const seriesMetadata = Object.values(seriesSummaryMetadata);
      DicomMetadataStore.addSeriesMetadata(seriesMetadata, madeInClient);

      Object.keys(instancesPerSeries).forEach(seriesInstanceUID =>
        DicomMetadataStore.addInstances(instancesPerSeries[seriesInstanceUID], madeInClient)
      );
      console.log('MyLog, Wado seriesMetadata', seriesMetadata);
    },

    _retrieveSeriesMetadataAsync: async (
      StudyInstanceUID,
      filters,
      sortCriteria,
      sortFunction,
      madeInClient = false
    ) => {
      const enableStudyLazyLoad = true;
      wadoDicomWebClient.headers = generateWadoHeader();
      wadoDicomWebClient.qidoURL = qidoConfig.url;
      wadoDicomWebClient.wadoURL = wadoConfig.url;
      wadoDicomWebClient.baseURL = wadoConfig.url;
      // Get Series
      console.log('MyLog, Wado _retrieveSeriesMetadataAsync', wadoDicomWebClient);
      const { preLoadData: seriesSummaryMetadata, promises: seriesPromises } =
        await retrieveStudyMetadata(
          wadoDicomWebClient,
          StudyInstanceUID,
          enableStudyLazyLoad,
          filters,
          sortCriteria,
          sortFunction
        );
      // console.log('MyLog, Wado _retrieveSeriesMetadataAsync', seriesSummaryMetadata);
      /**
       * naturalizes the dataset, and adds a retrieve bulkdata method
       * to any values containing BulkDataURI.
       * @param {*} instance
       * @returns naturalized dataset, with retrieveBulkData methods
       */
      const addRetrieveBulkData = instance => {
        const naturalized = naturalizeDataset(instance);
        // console.log(
        //   'MyLog, Wado _retrieveSeriesMetadataAsync,addRetrieveBulkData',
        //   naturalized,
        //   instance,
        //   dicomWebConfig.bulkDataURI?.enabled
        // );

        // if we know the server doesn't use bulkDataURI, then don't
        if (!dicomWebConfig.bulkDataURI?.enabled) {
          return naturalized;
        }

        Object.keys(naturalized).forEach(key => {
          const value = naturalized[key];
          // console.log(
          //   'MyLog, Wado _retrieveSeriesMetadataAsync,addRetrieveBulkData',
          //   value,
          //   value && value.BulkDataURI && !value.Value
          // );
          // The value.Value will be set with the bulkdata read value
          // in which case it isn't necessary to re-read this.
          if (value && value.BulkDataURI && !value.Value) {
            // Provide a method to fetch bulkdata
            value.retrieveBulkData = () => {
              // handle the scenarios where bulkDataURI is relative path
              fixBulkDataURI(value, naturalized, dicomWebConfig);

              const options = {
                // The bulkdata fetches work with either multipart or
                // singlepart, so set multipart to false to let the server
                // decide which type to respond with.
                multipart: false,
                BulkDataURI: value.BulkDataURI,
                // The study instance UID is required if the bulkdata uri
                // is relative - that isn't disallowed by DICOMweb, but
                // isn't well specified in the standard, but is needed in
                // any implementation that stores static copies of the metadata
                StudyInstanceUID: naturalized.StudyInstanceUID,
              };

              // Todo: this needs to be from wado dicom web client
              return qidoDicomWebClient.retrieveBulkData(options).then(val => {
                // There are DICOM PDF cases where the first ArrayBuffer in the array is
                // the bulk data and DICOM video cases where the second ArrayBuffer is
                // the bulk data. Here we play it safe and do a find.
                const ret =
                  (val instanceof Array && val.find(arrayBuffer => arrayBuffer?.byteLength)) ||
                  undefined;
                value.Value = ret;
                return ret;
              });
            };
          }
        });
        return naturalized;
      };

      // Async load series, store as retrieved
      function storeInstances(instances) {
        console.log('MyLog, Wado _retrieveSeriesMetadataAsync', instances);
        const naturalizedInstances = instances.map(addRetrieveBulkData);

        // Adding instanceMetadata to OHIF MetadataProvider
        naturalizedInstances.forEach((instance, index) => {
          console.log('MyLog , naturalizedInstances,', instance, dicomWebConfig.wadoRoot);
          instance.wadoRoot = dicomWebConfig.wadoRoot;
          instance.wadoUri = dicomWebConfig.wadoUri;

          const imageId = implementation.getImageIdsForInstance({
            instance,
          });

          // Adding imageId to each instance
          // Todo: This is not the best way I can think of to let external
          // metadata handlers know about the imageId that is stored in the store
          instance.imageId = imageId;

          // Adding UIDs to metadataProvider
          // Note: storing imageURI in metadataProvider since stack viewports
          // will use the same imageURI
          console.log('MyLog , naturalizedInstances,metadataProvider', metadataProvider);

          metadataProvider.addImageIdToUIDs(imageId, {
            StudyInstanceUID,
            SeriesInstanceUID: instance.SeriesInstanceUID,
            SOPInstanceUID: instance.SOPInstanceUID,
          });
        });

        DicomMetadataStore.addInstances(naturalizedInstances, madeInClient);
      }

      function setSuccessFlag() {
        console.log('MyLog, Wado _retrieveSeriesMetadataAsync,setSuccessFlag');
        const study = DicomMetadataStore.getStudy(StudyInstanceUID, madeInClient);
        study.isLoaded = true;
      }

      // Google Cloud Healthcare doesn't return StudyInstanceUID, so we need to add
      // it manually here
      seriesSummaryMetadata.forEach(aSeries => {
        aSeries.StudyInstanceUID = StudyInstanceUID;
      });

      DicomMetadataStore.addSeriesMetadata(seriesSummaryMetadata, madeInClient);

      const seriesDeliveredPromises = seriesPromises.map(promise =>
        promise.then(instances => {
          console.log('MyLog, Wado _retrieveSeriesMetadataAsync,seriesDeliveredPromises');
          storeInstances(instances);
        })
      );
      await Promise.all(seriesDeliveredPromises);
      setSuccessFlag();
    },
    deleteStudyMetadataPromise,
    getImageIdsForDisplaySet(displaySet) {
      console.log('MyLog, Wado _retrieveSeriesMetadataAsync,getImageIdsForDisplaySet', displaySet);
      const images = displaySet.images;
      const imageIds = [];

      if (!images) {
        return imageIds;
      }

      displaySet.images.forEach(instance => {
        console.log('MyLog, Wado _retrieveSeriesMetadataAsync, displaySet.images', instance);
        const NumberOfFrames = instance.NumberOfFrames;

        if (NumberOfFrames > 1) {
          for (let frame = 1; frame <= NumberOfFrames; frame++) {
            const imageId = this.getImageIdsForInstance({
              instance,
              frame,
            });
            imageIds.push(imageId);
          }
        } else {
          const imageId = this.getImageIdsForInstance({ instance });
          imageIds.push(imageId);
        }
      });

      return imageIds;
    },

    getImageIdsForInstance({ instance, frame }) {
      console.log('MyLog, Wado _retrieveSeriesMetadataAsync, getImageIdsForInstance');
      const imageIds = getImageId({
        instance,
        frame,
        config: dicomWebConfig,
      });
      return imageIds;
    },
    getConfig() {
      return dicomWebConfigCopy;
    },
    getPatientId({ query }) {
      try {
        console.log('MyLog', query);
        const PatientId = query.getAll('PatientID');
        return PatientId;
      } catch (ex) {
        console.error('MyLog', ex);
      }
      return null;
    },
    getIssuerOfPatientId({ query }) {
      try {
        console.log('MyLog', query);
        const IssuerOfPatientId = query.getAll('IssuerOfPatientID');
        return IssuerOfPatientId;
      } catch (ex) {
        console.error('MyLog', ex);
      }
      return null;
    },
    getStudyInstanceUIDs({ params, query }) {
      console.log('MyLog/getStudyInstanceUIDs');
      const { StudyInstanceUIDs: paramsStudyInstanceUIDs } = params;
      const queryStudyInstanceUIDs = utils.splitComma(query.getAll('StudyInstanceUIDs'));

      const StudyInstanceUIDs =
        (queryStudyInstanceUIDs.length && queryStudyInstanceUIDs) || paramsStudyInstanceUIDs;
      const StudyInstanceUIDsAsArray =
        StudyInstanceUIDs && Array.isArray(StudyInstanceUIDs)
          ? StudyInstanceUIDs
          : [StudyInstanceUIDs];

      return StudyInstanceUIDsAsArray;
    },
  };

  if (dicomWebConfig.supportsReject) {
    implementation.reject = dcm4cheeReject(dicomWebConfig.wadoRoot);
  }

  return IWebApiDataSource.create(implementation);
}

export { createDicomWebApi };

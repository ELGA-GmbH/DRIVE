import dcmjs from 'dcmjs';
import { sortStudySeries, sortingCriteria } from '@ohif/core/src/utils/sortStudy';
import QueryInstancesLoader from './queryInstancesLoader';

/**
 * Creates an immutable series loader object which loads each series sequentially using the iterator interface
 * @param {DICOMWebClient} dicomWebClient The DICOMWebClient instance to be used for series load
 * @param {string} studyInstanceUID The Study Instance UID from which series will be loaded
 * @param {Array} seriesInstanceUIDList A list of Series Instance UIDs
 * @returns {Object} Returns an object which supports loading of instances from each of given Series Instance UID
 */
function makeSeriesAsyncLoader(client, studyInstanceUID, seriesInstanceUIDList, filters) {
  return Object.freeze({
    hasNext() {
      return seriesInstanceUIDList.length > 0;
    },
    async next() {
      console.log('MyLog, RetrieveMetadata next', studyInstanceUID, seriesInstanceUIDList, filters);
      const seriesInstanceUID = seriesInstanceUIDList.shift();
      return client.searchForInstances({
        studyInstanceUID,
        seriesInstanceUID,
        queryParams: filters,
      });
    },
  });
}

/**
 * Class for async load of study metadata.
 * It inherits from RetrieveMetadataLoader
 *
 * It loads the one series and then append to seriesLoader the others to be consumed/loaded
 */
export default class QueryInstancesLoaderAsync extends QueryInstancesLoader {
  /**
   * @returns {Array} Array of preLoaders. To be consumed as queue
   */
  *getPreLoaders() {
    const preLoaders = [];
    const { studyInstanceUID, filters: { seriesInstanceUID } = {}, client } = this;
    console.log('MyLog, RetrieveMetadata - getPreLoaders', this.filters, client);
    if (seriesInstanceUID) {
      const options = {
        studyInstanceUID,
        queryParams: { SeriesInstanceUID: seriesInstanceUID, ...this.filters },
      };
      preLoaders.push(client.searchForSeries.bind(client, options));
    }
    if (this.filters.hasOwnProperty('token')) {
      delete this.filters.token;
    }
    if (this.filters.hasOwnProperty('hcp')) {
      delete this.filters.hcp;
    }
    const options = {
      studyInstanceUID,
      queryParams: this.filters,
    };
    // Fallback preloader
    preLoaders.push(client.searchForSeries.bind(client, options));

    yield* preLoaders;
  }

  async preLoad() {
    const preLoaders = this.getPreLoaders();
    const result = await this.runLoaders(preLoaders);
    const sortCriteria = this.sortCriteria;
    const sortFunction = this.sortFunction;

    const { naturalizeDataset } = dcmjs.data.DicomMetaDictionary;
    const naturalized = result.map(naturalizeDataset);

    return sortStudySeries(
      naturalized,
      sortCriteria || sortingCriteria.seriesSortCriteria.seriesInfoSortingCriteria,
      sortFunction
    );
  }

  async load(preLoadData) {
    const { client, studyInstanceUID, filters } = this;

    const seriesInstanceUIDs = preLoadData.map(s => s.SeriesInstanceUID);
    console.log('MyLog, RetrieveMetadata, Load', preLoadData, filters);
    const seriesAsyncLoader = makeSeriesAsyncLoader(
      client,
      studyInstanceUID,
      seriesInstanceUIDs,
      filters
    );
    console.log('MyLog, RetrieveMetadata, seriesAsyncLoader', seriesAsyncLoader);

    const promises = [];

    while (seriesAsyncLoader.hasNext()) {
      promises.push(seriesAsyncLoader.next());
    }

    return {
      preLoadData,
      promises,
    };
  }

  async posLoad({ preLoadData, promises }) {
    return {
      preLoadData,
      promises,
    };
  }
}

import React, { useState, useEffect, useMemo } from 'react';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import moment from 'moment';
import qs from 'query-string';
import isEqual from 'lodash.isequal';
import { useTranslation } from 'react-i18next';

//
import filtersMeta from './filtersMeta.js';
import { useAppConfig } from '@state';
import { useDebounce, useSearchParams } from '@hooks';
import { utils, hotkeys, ServicesManager } from '@ohif/core';

import {
  Icon,
  StudyListExpandedRow,
  LegacyButton,
  EmptyStudies,
  StudyListTable,
  StudyListPagination,
  StudyListFilter,
  TooltipClipboard,
  Header,
  useModal,
  AboutModal,
  UserPreferences,
  LoadingIndicatorProgress,
} from '@ohif/ui';

import i18n from '@ohif/i18n';
import { retrieveStudyMetadata } from 'extensions/default/src/DicomWebDataSource/retrieveStudyMetadata.js';
import imageIdToURI from 'platform/core/src/utils/imageIdToURI.js';

const { sortBySeriesDate } = utils;

const { availableLanguages, defaultLanguage, currentLanguage } = i18n;

const seriesInStudiesMap = new Map();

/**
 * TODO:
 * - debounce `setFilterValues` (150ms?)
 */
function ELGASelector({
  data: studies,
  dataTotal: studiesTotal,
  isLoadingData,
  dataSource,
  hotkeysManager,
  dataPath,
  onRefresh,
  servicesManager,
}) {
  const navigate = useNavigate();
  const searchParams = useSearchParams({ lowerCaseKeys: true });
  const { customizationService, userAuthenticationService } = (servicesManager as ServicesManager)
    .services;
  const queryFilterValues = _getQueryFilterValues(searchParams);
  console.log('MyLog / ElgaSelector', studies);
  const { hotkeyDefinitions, hotkeyDefaults } = hotkeysManager;
  const { show, hide } = useModal();
  const { t } = useTranslation();
  // ~ Modes
  const [appConfig] = useAppConfig();
  // ~ Filters

  const STUDIES_LIMIT = 101;

  const hcp = searchParams.get('hcp');
  const patientid = searchParams.get('patientid');
  const issuerofpatientid = searchParams.get('issuerofpatientid');
  if (hcp) {
    // if a token is passed in, set the userAuthenticationService to use it
    // for the Authorization header for all requests
    userAuthenticationService.setServiceImplementation({
      getAuthorizationHeader: () => ({
        Authorization: appConfig.elgaSettings.TokenType + ' ' + hcp,
      }),
    });
    //Create a URL object with the current location
    const urlObj = new URL(window.location.origin + location.pathname + location.search);
    if (appConfig.elgaSettings.RemoveTokenFromURLOnceLoadedIntoState) {
      // Remove the token from the URL object
      urlObj.searchParams.delete('hcp');
      const cleanUrl = urlObj.toString();

      // Update the browser's history without the token
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', cleanUrl);
      }
    }
  }
  const [filterValues, _setFilterValues] = useState({
    ...defaultFilterValues,
    ...queryFilterValues,
  });

  const debouncedFilterValues = useDebounce(filterValues, 200);
  const { resultsPerPage, pageNumber, sortBy, sortDirection } = filterValues;

  /*
   * The default sort value keep the filters synchronized with runtime conditional sorting
   * Only applied if no other sorting is specified and there are less than 101 studies
   */
  const canSort = studiesTotal < STUDIES_LIMIT;
  const shouldUseDefaultSort = sortBy === '' || !sortBy;
  const sortModifier = sortDirection === 'descending' ? 1 : -1;
  const defaultSortValues =
    shouldUseDefaultSort && canSort ? { sortBy: 'studyDate', sortDirection: 'ascending' } : {};
  const sortedStudies = studies;
  if (canSort) {
    studies.sort((s1, s2) => {
      if (shouldUseDefaultSort) {
        const ascendingSortModifier = -1;
        return _sortStringDates(s1, s2, ascendingSortModifier);
      }

      const s1Prop = s1[sortBy];
      const s2Prop = s2[sortBy];

      if (typeof s1Prop === 'string' && typeof s2Prop === 'string') {
        return s1Prop.localeCompare(s2Prop) * sortModifier;
      } else if (typeof s1Prop === 'number' && typeof s2Prop === 'number') {
        return (s1Prop > s2Prop ? 1 : -1) * sortModifier;
      } else if (!s1Prop && s2Prop) {
        return -1 * sortModifier;
      } else if (!s2Prop && s1Prop) {
        return 1 * sortModifier;
      } else if (sortBy === 'studyDate') {
        return _sortStringDates(s1, s2, sortModifier);
      }

      return 0;
    });
  }
  // ~ Rows & Studies
  const [expandedRows, setExpandedRows] = useState([]);
  const [studiesWithSeriesData, setStudiesWithSeriesData] = useState([]);
  const numOfStudies = studiesTotal;
  const querying = useMemo(() => {
    return isLoadingData || expandedRows.length > 0;
  }, [isLoadingData, expandedRows]);

  const generateViewerLinks = studies => {
    studies.forEach(study => {
      const { studyInstanceUid, modalities } = study;

      appConfig.loadedModes.forEach(mode => {
        const modalitiesToCheck = modalities.replaceAll('/', '\\');
        const isValidMode = mode.isValidMode({
          modalities: modalitiesToCheck,
          study,
        });

        if (isValidMode) {
          // Ensure an array exists for each mode
          if (!studyInstanceUidByMode[mode.routeName]) {
            studyInstanceUidByMode[mode.routeName] = [];
          }

          // Add studyInstanceUid to the list for the mode
          studyInstanceUidByMode[mode.routeName].push(studyInstanceUid);
        }
      });
    });
    console.log('MyLog, studieslinks', studyInstanceUidByMode);
    return Object.keys(studyInstanceUidByMode).map(routeName => {
      const query = new URLSearchParams();
      console.log('MyLog, studieslinks query', query);
      if (filterValues.configUrl) {
        query.append('configUrl', filterValues.configUrl);
      }
      query.append('StudyInstanceUIDs', studyInstanceUidByMode[routeName].join(','));
      return `${dataPath ? '../../' : ''}${routeName}${dataPath || ''}?${query.toString()}`;
    });
    // Combine the URLs for each mode into a comma-separated string
  };

  const setFilterValues = val => {
    if (filterValues.pageNumber === val.pageNumber) {
      val.pageNumber = 1;
    }
    _setFilterValues(val);
    setExpandedRows([]);
  };

  const onPageNumberChange = newPageNumber => {
    const oldPageNumber = filterValues.pageNumber;
    const rollingPageNumberMod = Math.floor(101 / filterValues.resultsPerPage);
    const rollingPageNumber = oldPageNumber % rollingPageNumberMod;
    const isNextPage = newPageNumber > oldPageNumber;
    const hasNextPage = Math.max(rollingPageNumber, 1) * resultsPerPage < numOfStudies;

    if (isNextPage && !hasNextPage) {
      return;
    }

    setFilterValues({ ...filterValues, pageNumber: newPageNumber });
  };

  const onResultsPerPageChange = newResultsPerPage => {
    setFilterValues({
      ...filterValues,
      pageNumber: 1,
      resultsPerPage: Number(newResultsPerPage),
    });
  };

  // Set body style
  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  // Sync URL query parameters with filters
  useEffect(() => {
    if (!debouncedFilterValues) {
      return;
    }

    const queryString = {};
    Object.keys(defaultFilterValues).forEach(key => {
      const defaultValue = defaultFilterValues[key];
      const currValue = debouncedFilterValues[key];
      // TODO: nesting/recursion?
      if (key === 'studyDate') {
        if (currValue.startDate && defaultValue.startDate !== currValue.startDate) {
          queryString.startDate = currValue.startDate;
        }
        if (currValue.endDate && defaultValue.endDate !== currValue.endDate) {
          queryString.endDate = currValue.endDate;
        }
      } else if (key === 'modalities' && currValue.length) {
        queryString.modalities = currValue.join(',');
      } else if (currValue !== defaultValue) {
        queryString[key] = currValue;
      }
    });
    const search = qs.stringify(queryString, {
      skipNull: true,
      skipEmptyString: true,
    });
    navigate({
      pathname: '/',
      search: search ? `?${search}` : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilterValues]);

  // Query for series information
  useEffect(() => {
    const fetchSeries = async studyInstanceUid => {
      try {
        console.log('MyLog, fetchSeries', studyInstanceUid);

        const series = await dataSource.query.series.search(studyInstanceUid, null);
        seriesInStudiesMap.set(studyInstanceUid, sortBySeriesDate(series));
        setStudiesWithSeriesData([...studiesWithSeriesData, studyInstanceUid]);
      } catch (ex) {
        // TODO: UI Notification Service
        console.warn(ex);
      }
    };

    // TODO: WHY WOULD YOU USE AN INDEX OF 1?!
    // Note: expanded rows index begins at 1
    for (let z = 0; z < expandedRows.length; z++) {
      const expandedRowIndex = expandedRows[z] - 1;
      const studyInstanceUid = sortedStudies[expandedRowIndex].studyInstanceUid;

      if (studiesWithSeriesData.includes(studyInstanceUid)) {
        continue;
      }

      fetchSeries(studyInstanceUid);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRows, studies]);

  const isFiltering = (filterValues, defaultFilterValues) => {
    return !isEqual(filterValues, defaultFilterValues);
  };

  const rollingPageNumberMod = Math.floor(101 / resultsPerPage);
  const rollingPageNumber = (pageNumber - 1) % rollingPageNumberMod;
  const offset = resultsPerPage * rollingPageNumber;
  const offsetAndTake = offset + resultsPerPage;

  const tableDataSource = sortedStudies.map((study, key) => {
    const rowKey = key + 1;
    const isExpanded = expandedRows.some(k => k === rowKey);
    const {
      studyInstanceUid,
      accession,
      modalities,
      description,
      institution,
      performingPhysicians,
      date,
      time,
    } = study;

    const studyDate =
      date &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD'], true).isValid() &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD']).format('MMM-DD-YYYY');
    const studyTime =
      time &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).isValid() &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).format('hh:mm A');

    return {
      row: [
        {
          key: 'studyDate',
          content: (
            <>
              {studyDate && <span className="mr-4">{studyDate}</span>}
              {studyTime && <span>{studyTime}</span>}
            </>
          ),
          title: `${studyDate || ''} ${studyTime || ''}`,
          gridCol: 6,
        },
        {
          key: 'description',
          content: <TooltipClipboard>{description}</TooltipClipboard>,
          gridCol: 6,
        },
        {
          key: 'modality',
          content: modalities,
          title: modalities,
          gridCol: 3,
        },
        {
          key: 'institution',
          content: institution ? (
            <TooltipClipboard>{institution}</TooltipClipboard>
          ) : (
            <span className="text-gray-700">(Empty)</span>
          ),
          gridCol: 6,
        },
        {
          key: 'accession',
          content: <TooltipClipboard>{accession}</TooltipClipboard>,
          gridCol: 3,
        },
      ],
      // Todo: This is actually running for all rows, even if they are
      // not clicked on.

      // <StudyListExpandedRow
      //   seriesTableColumns={{
      //     description: 'Description',
      //     seriesNumber: 'Series',
      //     modality: 'Modality',
      //     instances: 'Instances',
      //   }}
      //   seriesTableDataSource={
      //     seriesInStudiesMap.has(studyInstanceUid)
      //       ? seriesInStudiesMap.get(studyInstanceUid).map(s => {
      //         return {
      //           description: s.description || '(empty)',
      //           seriesNumber: s.seriesNumber ?? '',
      //           modality: s.modality || '',
      //           instances: s.numSeriesInstances || '',
      //         };
      //       })
      //       : []
      //   }
      // >
      //   <div className="flex flex-row gap-2">
      //     {appConfig.loadedModes.map((mode, i) => {
      //       const isFirst = i === 0;

      //       const modalitiesToCheck = modalities.replaceAll('/', '\\');

      //       const isValidMode = mode.isValidMode({
      //         modalities: modalitiesToCheck,
      //         study,
      //       });
      //       // TODO: Modes need a default/target route? We mostly support a single one for now.
      //       // We should also be using the route path, but currently are not
      //       // mode.routeName
      //       // mode.routes[x].path
      //       // Don't specify default data source, and it should just be picked up... (this may not currently be the case)
      //       // How do we know which params to pass? Today, it's just StudyInstanceUIDs and configUrl if exists
      //       const query = new URLSearchParams();
      //       console.log('MyLog, loadedModes query', query);
      //       if (filterValues.configUrl) {
      //         query.append('configUrl', filterValues.configUrl);
      //       }
      //       query.append('StudyInstanceUIDs', studyInstanceUid);
      //       return (
      //         mode.displayName && (
      //           <Link
      //             className={isValidMode ? '' : 'cursor-not-allowed'}
      //             key={i}
      //             to={`${dataPath ? '../../' : ''}${mode.routeName}${dataPath || ''
      //               }?${query.toString()}`}
      //             onClick={event => {
      //               // In case any event bubbles up for an invalid mode, prevent the navigation.
      //               // For example, the event bubbles up when the icon embedded in the disabled button is clicked.
      //               if (!isValidMode) {
      //                 event.preventDefault();
      //               }
      //             }}
      //           // to={`${mode.routeName}/dicomweb?StudyInstanceUIDs=${studyInstanceUid}`}
      //           >
      //             {/* TODO revisit the completely rounded style of buttons used for launching a mode from the worklist later - for now use LegacyButton*/}
      //             <LegacyButton
      //               rounded="full"
      //               variant={isValidMode ? 'contained' : 'disabled'}
      //               disabled={!isValidMode}
      //               endIcon={<Icon name="launch-arrow" />} // launch-arrow | launch-info
      //               onClick={() => { }}
      //             >
      //               <>
      //                 {t(`Modes:${mode.displayName}`)} asdasd
      //                 {`${dataPath ? '../../' : ''}${mode.routeName}${dataPath || ''
      //                   }?${query.toString()}`}
      //               </>
      //             </LegacyButton>
      //           </Link>
      //         )
      //       );
      //     })}
      //   </div>
      // </StudyListExpandedRow>

      onClickRow: () => {
        console.log('Open Row', studyInstanceUid, patientid, issuerofpatientid, hcp);
        const query = new URLSearchParams();
        if (filterValues.configUrl) {
          query.append('configUrl', filterValues.configUrl);
        }
        query.append('StudyInstanceUIDs', studyInstanceUid);
        query.append('PatientID', patientid);
        query.append('IssuerOfPatientID', issuerofpatientid);
        query.append('hcp', hcp);

        const modalitiesToCheck = modalities.replaceAll('/', '\\');
        const PossibleViewers = appConfig.loadedModes.filter(x =>
          x.isValidMode({
            modalities: modalitiesToCheck,
            study,
          })
        );
        if (PossibleViewers.length > 0) {
          navigate(
            `${dataPath ? '../../' : ''}${PossibleViewers[0].routeName}${dataPath || ''
            }?${query.toString()}`
          );
        }
      },
      isExpanded,
    };
  });

  const hasStudies = numOfStudies > 0;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;
  if (studies?.length == 1) {
    const study = studies[0];
    const { studyInstanceUid, modalities } = study;
    const query = new URLSearchParams();
    if (filterValues.configUrl) {
      query.append('configUrl', filterValues.configUrl);
    }
    query.append('StudyInstanceUIDs', studyInstanceUid);
    query.append('PatientID', patientid);
    query.append('IssuerOfPatientID', issuerofpatientid);
    query.append('hcp', hcp);

    const modalitiesToCheck = modalities.replaceAll('/', '\\');
    const PossibleViewers = appConfig.loadedModes.filter(x =>
      x.isValidMode({
        modalities: modalitiesToCheck,
        study,
      })
    );
    if (PossibleViewers.length > 0) {
      navigate(
        `${dataPath ? '../../' : ''}${PossibleViewers[0].routeName}${dataPath || ''
        }?${query.toString()}`
      );
    }
  }

  const menuOptions = [
    {
      title: t('Header:About'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: 'About OHIF Viewer',
          contentProps: { versionNumber, commitHash },
        }),
    },
    {
      title: t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          title: t('UserPreferencesModal:User Preferences'),
          content: UserPreferences,
          contentProps: {
            hotkeyDefaults: hotkeysManager.getValidHotkeyDefinitions(hotkeyDefaults),
            hotkeyDefinitions,
            onCancel: hide,
            currentLanguage: currentLanguage(),
            availableLanguages,
            defaultLanguage,
            onSubmit: state => {
              if (state.language.value !== currentLanguage().value) {
                i18n.changeLanguage(state.language.value);
              }
              hotkeysManager.setHotkeys(state.hotkeyDefinitions);
              hide();
            },
            onReset: () => hotkeysManager.restoreDefaultBindings(),
            hotkeysModule: hotkeys,
          },
        }),
    },
  ];

  if (appConfig.oidc) {
    menuOptions.push({
      icon: 'power-off',
      title: t('Header:Logout'),
      onClick: () => {
        navigate(`/logout?redirect_uri=${encodeURIComponent(window.location.href)}`);
      },
    });
  }

  const { component: dicomUploadComponent } =
    customizationService.get('dicomUploadComponent') ?? {};
  const uploadProps =
    dicomUploadComponent && dataSource.getConfig()?.dicomUploadEnabled
      ? {
        title: 'Upload files',
        closeButton: true,
        shouldCloseOnEsc: false,
        shouldCloseOnOverlayClick: false,
        content: dicomUploadComponent.bind(null, {
          dataSource,
          onComplete: () => {
            hide();
            onRefresh();
          },
          onStarted: () => {
            show({
              ...uploadProps,
              // when upload starts, hide the default close button as closing the dialogue must be handled by the upload dialogue itself
              closeButton: false,
            });
          },
        }),
      }
      : undefined;

  const { component: dataSourceConfigurationComponent } =
    customizationService.get('ohif.dataSourceConfigurationComponent') ?? {};

  if (studies?.length == 0) {
    return <>No Studies Found!</>;
  }
  console.log('MyLOG', appConfig.showLoadingIndicator, isLoadingData);
  return (
    <div className="flex h-screen flex-col bg-black ">
      <Header
        isSticky
        menuOptions={menuOptions}
        isReturnEnabled={false}
        WhiteLabeling={appConfig.whiteLabeling}
      />
      <div className="ohif-scrollbar flex grow flex-col overflow-y-auto">
        <StudyListFilter
          numOfStudies={pageNumber * resultsPerPage > 100 ? 101 : numOfStudies}
          filtersMeta={filtersMeta}
          filterValues={{ ...filterValues, ...defaultSortValues }}
          onChange={setFilterValues}
          isFiltering={isFiltering(filterValues, defaultFilterValues)}
          getDataSourceConfigurationComponent={
            dataSourceConfigurationComponent ? () => dataSourceConfigurationComponent() : undefined
          }
        />
        {hasStudies ? (
          <div className="flex grow flex-col">
            <StudyListTable
              tableDataSource={tableDataSource.slice(offset, offsetAndTake)}
              numOfStudies={numOfStudies}
              querying={querying}
              filtersMeta={filtersMeta}
            />
            <div className="grow">
              <StudyListPagination
                onChangePage={onPageNumberChange}
                onChangePerPage={onResultsPerPageChange}
                currentPage={pageNumber}
                perPage={resultsPerPage}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-48">
            {appConfig.showLoadingIndicator && isLoadingData ? (
              <>
                <LoadingIndicatorProgress className={'h-full w-full bg-black'} />
                <>Das Laden der ELGA-Studien kann einige Zeit benötigen...</>
              </>
            ) : (
              <EmptyStudies />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

ELGASelector.propTypes = {
  data: PropTypes.array.isRequired,
  dataSource: PropTypes.shape({
    query: PropTypes.object.isRequired,
    getConfig: PropTypes.func,
  }).isRequired,
  isLoadingData: PropTypes.bool.isRequired,
  servicesManager: PropTypes.instanceOf(ServicesManager),
};

const defaultFilterValues = {
  patientName: '',
  patientId: '',
  issuerOfPatientId: null,
  studyDate: {
    startDate: null,
    endDate: null,
  },
  description: '',
  modalities: [],
  accession: '',
  issuerOfAccessionNumber: '',
  sortBy: '',
  sortDirection: 'none',
  pageNumber: 1,
  resultsPerPage: 25,
  datasources: '',
  hcp: '',
  configUrl: null,
};

function _tryParseInt(str, defaultValue) {
  let retValue = defaultValue;
  if (str && str.length > 0) {
    if (!isNaN(str)) {
      retValue = parseInt(str);
    }
  }
  return retValue;
}

function _getQueryFilterValues(origParams) {
  const params = new URLSearchParams();
  console.log('MyLog, _getQueryFilterValues', params, origParams);
  for (const [name, value] of origParams) {
    params.append(name.toLowerCase(), value);
  }
  console.log('MyLog, _getQueryFilterValues', params, origParams);
  const queryFilterValues = {
    patientId: params.get('patientid'),
    issuerOfPatientId: params.get('issuerofpatientid'),
    patientName: params.get('patientname'),
    studyDate: {
      startDate: params.get('startdate') || null,
      endDate: params.get('enddate') || null,
    },
    description: params.get('description'),
    modalities: params.get('modalities') ? params.get('modalities').split(',') : [],
    accession: params.get('accession'),
    issuerOfAccessionNumber: params.get('issuerofaccessionnumber'),
    sortBy: params.get('sortby'),
    sortDirection: params.get('sortdirection'),
    pageNumber: _tryParseInt(params.get('pagenumber'), undefined),
    resultsPerPage: _tryParseInt(params.get('resultsperpage'), undefined),
    datasources: params.get('datasources'),
    hcp: params.get('hcp'),
    configUrl: params.get('configurl'),
  };

  console.log('MyLog, _getQueryFilterValues', params, queryFilterValues);
  // Delete null/undefined keys

  Object.keys(queryFilterValues).forEach(
    key => queryFilterValues[key] == null && delete queryFilterValues[key]
  );
  const query = new URLSearchParams(window.location.search);
  console.log('MyLog, _getQueryFilterValues query', window.location.search, query);
  return queryFilterValues;
}

function _sortStringDates(s1, s2, sortModifier) {
  // TODO: Delimiters are non-standard. Should we support them?
  const s1Date = moment(s1.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);
  const s2Date = moment(s2.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);

  if (s1Date.isValid() && s2Date.isValid()) {
    return (s1Date.toISOString() > s2Date.toISOString() ? 1 : -1) * sortModifier;
  } else if (s1Date.isValid()) {
    return sortModifier;
  } else if (s2Date.isValid()) {
    return -1 * sortModifier;
  }
}

export default ELGASelector;

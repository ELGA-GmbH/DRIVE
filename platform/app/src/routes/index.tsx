import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@ohif/ui';

// Route Components
import DataSourceWrapper from './DataSourceWrapper';
import WorkList from './WorkList';
import Local from './Local';
import Debug from './Debug';
import NotFound from './NotFound';
import buildModeRoutes from './buildModeRoutes';
import PrivateRoute from './PrivateRoute';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import ELGASelector from './ELGASelector';

const NotFoundServer = ({
  message = 'Unable to query for studies at this time. Check your data source configuration or network connection',
}) => {
  return (
    <div className="absolute flex h-full w-full items-center justify-center text-white">
      <div>
        <h4>{message}</h4>
      </div>
    </div>
  );
};
const OnlyWithParamsWrapper = props => {
  const params = new URLSearchParams(location.search.toLowerCase());
  const patientId = params.get('patientid');
  const issuerofpatientId = params.get('issuerofpatientid');
  const hcp = params.get('hcp');

  // Params are present, render your component or perform necessary actions
  const ErrorMessages = [];
  if (patientId == null || patientId == '') {
    ErrorMessages.push(<>Bitte PatientId angeben!</>);
  }
  if (issuerofpatientId == null || issuerofpatientId == '') {
    ErrorMessages.push(<>Bitte IssuerOfPatientId angegeben!</>);
  }
  if (hcp == null || hcp == '') {
    ErrorMessages.push(<>Bitte HCP-Token angegeben!</>);
  }
  console.log('ErrorMessages', ErrorMessages);
  if (ErrorMessages.length > 0) {
    return (
      <div className="absolute flex h-full w-full items-center justify-center text-white">
        <div>
          <h2>
            <b>Konnte keine Daten laden:</b>
          </h2>
          <ul style={{ marginTop: '15px' }}>
            {ErrorMessages.map(x => (
              <li>{x}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  return DataSourceWrapper(props);
};

NotFoundServer.propTypes = {
  message: PropTypes.string,
};

const NotFoundStudy = () => {
  return (
    <div className="absolute flex h-full w-full items-center justify-center text-white">
      <div>
        <h4>
          One or more of the requested studies are not available at this time. Return to the{' '}
          <Link
            className="text-primary-light"
            to={'/'}
          >
            study list
          </Link>{' '}
          to select a different study to view.
        </h4>
      </div>
    </div>
  );
};

NotFoundStudy.propTypes = {
  message: PropTypes.string,
};

// TODO: Include "routes" debug route if dev build
const bakedInRoutes = [
  {
    path: '/notfoundserver',
    children: NotFoundServer,
  },
  {
    path: '/notfoundstudy',
    children: NotFoundStudy,
  },
  {
    path: '/debug',
    children: Debug,
  },
  {
    path: '/local',
    children: Local.bind(null, { modePath: '' }), // navigate to the worklist
  },
  {
    path: '/localbasic',
    children: Local.bind(null, { modePath: 'viewer/dicomlocal' }),
  },
];

// NOT FOUND (404)
const notFoundRoute = { component: NotFound };

const createRoutes = ({
  modes,
  dataSources,
  extensionManager,
  servicesManager,
  commandsManager,
  hotkeysManager,
  routerBasename,
  showStudyList,
}) => {
  const routes =
    buildModeRoutes({
      modes,
      dataSources,
      extensionManager,
      servicesManager,
      commandsManager,
      hotkeysManager,
    }) || [];

  // return (
  //   <>
  //     <Routes>
  //       <Route path="/">
  //         <div style={{ backgroundColor: 'white' }}>asdasdasd</div>
  //       </Route>
  //     </Routes>
  //     asdasd
  //   </>
  // );
  const { customizationService } = servicesManager.services;

  const ELGAWorkListRoute = {
    path: '/',
    children: OnlyWithParamsWrapper,
    private: true,
    props: { children: ELGASelector, servicesManager, extensionManager },
  };
  const WorkListRoute = {
    path: '/',
    children: DataSourceWrapper,
    private: true,
    props: { children: WorkList, servicesManager, extensionManager },
  };

  const customRoutes = customizationService.getGlobalCustomization('customRoutes');
  console.log('MyLog, customRoutes', DataSourceWrapper);
  const allRoutes = [
    ...routes,
    ...(showStudyList ? [ELGAWorkListRoute] : []),
    ...(customRoutes?.routes || []),
    ...bakedInRoutes,
    customRoutes?.notFoundRoute || notFoundRoute,
  ];
  console.log('allRoutes', allRoutes);
  function RouteWithErrorBoundary({ route, ...rest }) {
    // eslint-disable-next-line react/jsx-props-no-spreading
    return (
      <ErrorBoundary
        context={`Route ${route.path}`}
        fallbackRoute="/"
      >
        <route.children
          {...rest}
          {...route.props}
          route={route}
          servicesManager={servicesManager}
          extensionManager={extensionManager}
          hotkeysManager={hotkeysManager}
        />
      </ErrorBoundary>
    );
  }

  const { userAuthenticationService } = servicesManager.services;

  // Note: PrivateRoutes in react-router-dom 6.x should be defined within
  // a Route element
  return (
    <Routes>
      {allRoutes.map((route, i) => {
        return route.private === true ? (
          <Route
            key={i}
            exact
            path={route.path}
            element={
              <PrivateRoute handleUnauthenticated={userAuthenticationService.handleUnauthenticated}>
                <RouteWithErrorBoundary route={route} />
              </PrivateRoute>
            }
          ></Route>
        ) : (
          <Route
            key={i}
            path={route.path}
            element={<RouteWithErrorBoundary route={route} />}
          />
        );
      })}
    </Routes>
  );
};

export default createRoutes;

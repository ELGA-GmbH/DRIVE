import React, { createContext, useContext, useReducer, useMemo } from 'react';

// export const IMAGE_VIEWER_DEFAULT_VALUE = {
//   StudyInstanceUIDs: [],
//   setImageViewer: () => {},
// };

export const ImageViewerContext = createContext();

export function ImageViewerProvider({
  StudyInstanceUIDs,
  PatientID,
  IssuerOfPatientId,
  reducer,
  initialState,
  children,
}) {
  console.log('MyLog, ImageViewerProvider', StudyInstanceUIDs);
  const value = useMemo(() => {
    console.log(
      'MyLog, ImageViewerProvider inside Memo',
      StudyInstanceUIDs,
      PatientID,
      IssuerOfPatientId
    );
    if (PatientID != null && IssuerOfPatientId) {
      return { StudyInstanceUIDs, PatientID, IssuerOfPatientId };
    }
  }, [StudyInstanceUIDs, PatientID, IssuerOfPatientId]);

  return <ImageViewerContext.Provider value={value}>{children}</ImageViewerContext.Provider>;
}

export const useImageViewer = () => useContext(ImageViewerContext);

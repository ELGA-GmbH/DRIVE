import React, { createContext, useContext, useReducer, useMemo } from 'react';

// export const IMAGE_VIEWER_DEFAULT_VALUE = {
//   StudyInstanceUIDs: [],
//   setImageViewer: () => {},
// };

export const ImageViewerContext = createContext();

export function ImageViewerProvider({
  StudyInstanceUIDs,
  PatientID,
  reducer,
  initialState,
  children,
}) {
  console.log('MyLog, ImageViewerProvider', StudyInstanceUIDs);
  const value = useMemo(() => {
    console.log('MyLog, ImageViewerProvider inside Memo', StudyInstanceUIDs, PatientID);
    if (PatientID != null) {
      return { StudyInstanceUIDs, PatientID };
    }
  }, [StudyInstanceUIDs, PatientID]);

  return <ImageViewerContext.Provider value={value}>{children}</ImageViewerContext.Provider>;
}

export const useImageViewer = () => useContext(ImageViewerContext);

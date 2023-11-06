async function getStudiesForPatientByMRN(dataSource, qidoForStudyUID) {
  if (qidoForStudyUID && qidoForStudyUID.length && qidoForStudyUID[0].mrn) {
    console.log('getStudiesForPatientByMRN');
    return dataSource.query.studies.search({
      patientId: qidoForStudyUID[0].mrn,
    });
  }
  console.log('No mrn found for', qidoForStudyUID);
  return qidoForStudyUID;
}

export default getStudiesForPatientByMRN;

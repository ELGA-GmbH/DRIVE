const filtersMeta = [
  {
    name: 'studyDate',
    displayName: 'StudyDate',
    inputType: 'DateRange',
    isSortable: true,
    gridCol: 6,
  },
  {
    name: 'description',
    displayName: 'StudyDescription',
    inputType: 'Text',
    isSortable: true,
    gridCol: 6,
  },
  {
    name: 'modalities',
    displayName: 'Modality',
    inputType: 'MultiSelect',
    inputProps: {
      options: [
        { value: 'CR', label: 'CR' },
        { value: 'CT', label: 'CT' },
        { value: 'MR', label: 'MR' },
        { value: 'US', label: 'US' },
        { value: 'PT', label: 'PT' },
        { value: 'ES', label: 'ES' },
        { value: 'AR', label: 'AR' },
        { value: 'ASMT', label: 'ASMT' },
        { value: 'AU', label: 'AU' },
        { value: 'BDUS', label: 'BDUS' },
        { value: 'BI', label: 'BI' },
        { value: 'BMD', label: 'BMD' },
        { value: 'CTPROTOCOL', label: 'CTPROTOCOL' },
        { value: 'DG', label: 'DG' },
        { value: 'DOC', label: 'DOC' },
        { value: 'DX', label: 'DX' },
        { value: 'ECG', label: 'ECG' },
        { value: 'EPS', label: 'EPS' },
        { value: 'FID', label: 'FID' },
        { value: 'GM', label: 'GM' },
        { value: 'HC', label: 'HC' },
        { value: 'HD', label: 'HD' },
        { value: 'IO', label: 'IO' },
        { value: 'IOL', label: 'IOL' },
        { value: 'IVOCT', label: 'IVOCT' },
        { value: 'IVUS', label: 'IVUS' },
        { value: 'KER', label: 'KER' },
        { value: 'KO', label: 'KO' },
        { value: 'LEN', label: 'LEN' },
        { value: 'LS', label: 'LS' },
        { value: 'MG', label: 'MG' },
        { value: 'M3D', label: 'M3D' },
        { value: 'NM', label: 'NM' },
        { value: 'OAM', label: 'OAM' },
        { value: 'OCT', label: 'OCT' },
        { value: 'OP', label: 'OP' },
        { value: 'OPM', label: 'OPM' },
        { value: 'OPT', label: 'OPT' },
        { value: 'OPTBSV', label: 'OPTBSV' },
        { value: 'OPTENF', label: 'OPTENF' },
        { value: 'OPV', label: 'OPV' },
        { value: 'OSS', label: 'OSS' },
        { value: 'OT', label: 'OT' },
        { value: 'PLAN', label: 'PLAN' },
        { value: 'PR', label: 'PR' },
        { value: 'PX', label: 'PX' },
        { value: 'REG', label: 'REG' },
        { value: 'RESP', label: 'RESP' },
        { value: 'RF', label: 'RF' },
        { value: 'RG', label: 'RG' },
        { value: 'RTDOSE', label: 'RTDOSE' },
        { value: 'RTIMAGE', label: 'RTIMAGE' },
        { value: 'RTINTENT', label: 'RTINTENT' },
        { value: 'RTPLAN', label: 'RTPLAN' },
        { value: 'RTRAD', label: 'RTRAD' },
        { value: 'RTRECORD', label: 'RTRECORD' },
        { value: 'RTSEGANN', label: 'RTSEGANN' },
        { value: 'RTSTRUCT', label: 'RTSTRUCT' },
        { value: 'RWV', label: 'RWV' },
        { value: 'SEG', label: 'SEG' },
        { value: 'SM', label: 'SM' },
        { value: 'SMR', label: 'SMR' },
        { value: 'SR', label: 'SR' },
        { value: 'SRF', label: 'SRF' },
        { value: 'STAIN', label: 'STAIN' },
        { value: 'TEXTUREMAP', label: 'TEXTUREMAP' },
        { value: 'TG', label: 'TG' },
        { value: 'VA', label: 'VA' },
        { value: 'XA', label: 'XA' },
        { value: 'XC', label: 'XC' },
      ],
    },
    isSortable: true,
    gridCol: 3,
  },
  {
    name: 'institution',
    displayName: 'Institution',
    inputType: 'Text',
    isSortable: true,
    gridCol: 6,
  },
  {
    name: 'accession',
    displayName: 'AccessionNumber',
    inputType: 'Text',
    isSortable: true,
    gridCol: 3,
  },
  // {
  //   name: 'instances',
  //   displayName: 'Instances',
  //   inputType: 'None',
  //   isSortable: false,
  //   gridCol: 2,
  // },
];

export default filtersMeta;

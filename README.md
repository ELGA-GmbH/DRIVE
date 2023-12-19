# Table of Contents
1. [Installation](#installation)
   1. [Preparation](#preparation)
   2. [Docker Usage](#docker-usage)
2. [Changes & Technical Description](#changes--technical-description)
   1. [DicomWeb Communication](#dicomweb-communication)
   2. [StudyListViewer](#studylistviewer)
   3. [Viewer](#viewer)
3. [URL Parameters / Usage](#url-parameters--usage)


# Installation
The preferred installation-method is docker.

## Preparation:
The following parameters need to be known before installation:
- QIDO-SF URL
- The port OHIF should be exposed to the outside world.
- If the installation is anything but a local test-installation, SSL certificates are needed

There are two major ways of starting this image - either by using docker-compose or just docker.

The following part describes how to start the container with docker-compose. This is only an example as to how it can be used and should not be used in a production envirnonment!

Before the service startup several things need to be configured:
- go into the folder 'docker' in the root of this repository.
- there you will find a docker-compose.yml, a nginx.conf file and an ohif.js file.
	1) configure the NGINX file, change the QIDO-SF address, the address where OHIF is hosted and possibly  add a certificate.
	2) you might have to change the docker-compose file so it uses the correct ports
	3) you might want to add a logo
	
- the next step is to start the docker-container by opening a terminal in the docker folder and running the command ```docker-compose up -d```

NGINX was used as a proxy to reduce problems with CORS in this development environment.

For a more detailed description or guide on how to start this container without docker-compose please refer to the instructions under: [https://docs.ohif.org/deployment/docker#running-the-docker-container](https://docs.ohif.org/deployment/docker#running-the-docker-container)

# Changes & Technical Description

## DicomWeb Communication
The QIDO requests were changed to include the DICOM Issuer of Patient ID, AccessionNumber and Issuer of Accession Number for the DicomWebDataSource.

QIDO reqeusts were also changed to query on all levels including instance level.

WADO-Metadata requests where changed from a series-level request to an instance level request.


## StudyListViewer
A new view called 'ELGAStudyListViewer' based on the default StudyListViewer was created. It expects the get-parameters 'issuerOfPatientId', 'patientId' and 'hcp'. If they are not given, the following error message will be displayed:

```
Konnte keine Daten laden:

    Bitte PatientId angeben!
    Bitte IssuerOfPatientId angegeben!
    Bitte HCP-Token angegeben!
```

The parameters 'issuerOfAccessionNumber' and 'accession' are optional parameters that can be set as get-parameters to filter by the accessionnumber. It is only possible to use both parameters at the same time. If one is not set, then an error message will be displayed.

If more than one study is available with the given get-parameters, a list will be displayed, from which the user can choose one entry to view.

![Studlist](docs/StudyList.png)

The columns were changed from OHIF-base to better reflect the needs of users in an ELGA-Environment, as well as

If only one study is found, the Image-Viewer will directly be opened with this one study. This can happen, if the patient only has one study, or the filters were set so that only this one study is found.

## Viewer

In this version only the default OHIF-Viewer is available, viewers like Microscopy or 3D are disabled.
The GUI elements of the default-Viewer were changed, so that changing between studies is no longer possible. This was done due to increased loading times and possible unnecessary QIDO-queries when loading the StudyList with the 'issuerOfAccessionNumber' and 'accession' - parameters.

![Studlist](docs/ViewerStudyListComparison.png)

The left, yellow marked Study List Viewer is part of the StudyViewer, where the user is able to switch between series and studies. For the study-switcher to work, all studies of the patient need to be loaded. In the ELGA-Environment this means significantly higher loading times without any major gain in usability. This feature as seen on the right, red marked side was removed.


# URL Parameters / Usage
There are two urls that can be called. The first and suggested one is the URL that calls the router. This router will query possible Studies, if more than one exists, then the user is presented with a selection table. Otherwise it will automatically forward to the viewer.

This URL looks like the following:

```http[s]://{Server}[:port]/?patientid={PatientId}&issuerOfPatientId={IssuerOfPatientId}[&accession={AccessionNumber}&issuerOfAccessionNumber={IssuerOfAccessionNumber}]&hcp={HCP-Token}```
* {Server}: Server Address
* {PatientId}: most likely the social security number or a BPK (Bereichsspezifisches Personenkennzeichen)
* {IssuerOfPatientId}: defines the type of PatientId used, for SSN it is '1.2.40.0.10.1.4.3.1' or for BPK '1.2.40.0.10.2.1.1.149'
* {AccessionNumber} - is an optional parameter, if used, {issuerOfAccessionNumber} has to be set. If more than one study for the selected patient with this accessionnumber is found or if this variable is not used, a selection-table for all filtered studies will be shown.
* {issuerOfAccessionNumber} - is optional, but must be set if {AccessionNumber} is set. It has to be set to the issuer of accession number that is found in the referencedId-List of the metadataset provided by ITI-18.
* {HCP-Token}: Must be in the Base64 Format


If the user wants to directly call the viewer, the StudyInstanceUID must be already known by the calling application.
The following URL-Pattern can be used to directly call OHIF if a StudyInstanceUID is already known:

```http[s]://{Server}[:port]/viewer?StudyInstanceUIDs={StudyInstanceUID}&PatientID={PatientId}&IssuerOfPatientId={IssuerOfPatientId}&hcp={HCP-Token}```


* {PatientId}: most likely the social security number or a BPK (Bereichsspezifisches Personenkennzeichen)
* {IssuerOfPatientId}: defines the type of PatientId used, for SSN it is '1.2.40.0.10.1.4.3.1' or for BPK '1.2.40.0.10.2.1.1.149'
* {HCP-Token}: Must be in the Base64 Format
* {StudyInstanceUID}: A valid StudyInstanceUID

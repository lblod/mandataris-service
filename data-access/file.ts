/* eslint-disable prettier/prettier */
import { updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeDateTime, sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { v4 as uuidv4 } from 'uuid';

export const storeFile = async (file, orgGraph: string) => {
  const originalFileName = file.originalname;
  const generatedName = file.filename;
  const format = file.mimetype;
  const size = file.size;
  const extension = file.originalname.split('.').pop();
  const uuid = uuidv4();
  const uuidDataObject = uuidv4();
  const now = sparqlEscapeDateTime(new Date());
  const fileUri = `http://mu.semte.ch/services/file-service/files/${uuid}`;
  await updateSudo(`
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(fileUri)} a <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#FileDataObject> ;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#fileName> "${sparqlEscapeString(originalFileName)}" ;
          <http://mu.semte.ch/vocabularies/core/uuid> ${sparqlEscapeString(uuid)} ;
          <http://purl.org/dc/terms/format> ${sparqlEscapeString(format)} ;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#fileSize> ${sparqlEscapeString(size)}^^xsd:integer ;
          <http://dbpedia.org/ontology/fileExtension> ${sparqlEscapeString(extension)} ;
          <http://purl.org/dc/terms/created> ${now};
          <http://purl.org/dc/terms/modified> ${now} .
        <share://burgemeester-benoemingen/${generatedName}> a <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#FileDataObject> ;
          <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#dataSource> ${sparqlEscapeUri(fileUri)} ;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#fileName> ${sparqlEscapeString(generatedName)} ;
          <http://mu.semte.ch/vocabularies/core/uuid> ${sparqlEscapeString(uuidDataObject)} ;
          <http://purl.org/dc/terms/format> ${sparqlEscapeString(format)} ;
          <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#fileSize> ${sparqlEscapeString(size)}^^xsd:integer ;
          <http://dbpedia.org/ontology/fileExtension> ${sparqlEscapeString(extension)} ;
          <http://purl.org/dc/terms/created> ${now} ;
          <http://purl.org/dc/terms/modified> ${now} .
      }
    }`);
  return fileUri;
};

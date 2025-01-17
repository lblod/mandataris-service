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
  const fileUri = `http://mu.semte.ch/services/file-service/files/${uuid}`;
  const e = {
    uuid: sparqlEscapeString(uuid),
    uuidDataObject: sparqlEscapeString(uuidDataObject),
    fileUri: sparqlEscapeUri(fileUri),
    originalFileName: sparqlEscapeString(originalFileName),
    format: sparqlEscapeString(format),
    extension: sparqlEscapeString(extension),
    generatedName: sparqlEscapeString(generatedName),
    dateNow: sparqlEscapeDateTime(new Date()),
    shareUri: sparqlEscapeUri(
      `share://burgemeester-benoemingen/${generatedName}`,
    ),
  };

  await updateSudo(`
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX dbp: <http://dbpedia.org/ontology/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX: mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${e.fileUri} a nfo:FileDataObject> ;
          nfo:fileName ${e.originalFileName} ;
          mu:uuid ${e.uuid} ;
          dcterms:format ${e.format} ;
          nfo:fileSize "${size}"^^xsd:integer ;
          dbp:fileExtension ${e.extension} ;
          dcterms:created ${e.dateNow};
          dcterms:modified ${e.dateNow} .
        ${e.shareUri} a nfo:FileDataObject ;
          nie:dataSource ${e.fileUri} ;
          nfo:fileName ${e.generatedName} ;
          mu:uuid ${e.uuidDataObject} ;
          dcterms:format ${e.format} ;
          nfo:fileSize "${size}"^^xsd:integer ;
          dbp:fileExtension ${e.extension} ;
          dcterms:created ${e.dateNow} ;
          dcterms:modified ${e.dateNow} .
      }
    }`);
  return fileUri;
};

import { updateSudo } from '@lblod/mu-auth-sudo';
import {
  sparqlEscapeDateTime,
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeInt,
} from 'mu';
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
  const shareBurgemeesterUri = sparqlEscapeUri(
    `share://burgemeester-benoemingen/${generatedName}`,
  );

  await updateSudo(`
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX dpb: <http://dbpedia.org/ontology/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(orgGraph)} {
        ${sparqlEscapeUri(fileUri)} a nfo:FileDataObject ;
          nfo:fileName ${sparqlEscapeString(originalFileName)} ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
          dcterms:format ${sparqlEscapeString(format)} ;
          nfo:fileSize ${sparqlEscapeInt(size)} ;
          dpb:fileExtension ${sparqlEscapeString(extension)} ;
          dcterms:created ${now};
          dcterms:modified ${now} .
        ${shareBurgemeesterUri} a nfo:FileDataObject ;
          nie:dataSource ${sparqlEscapeUri(fileUri)} ;
          nfo:fileName ${sparqlEscapeString(generatedName)} ;
          mu:uuid ${sparqlEscapeString(uuidDataObject)} ;
          dcterms:format ${sparqlEscapeString(format)} ;
          nfo:fileSize ${sparqlEscapeInt(size)} ;
          dpb:fileExtension ${sparqlEscapeString(extension)} ;
          dcterms:created ${now} ;
          dcterms:modified ${now} .
      }
    }`);

  return fileUri;
};

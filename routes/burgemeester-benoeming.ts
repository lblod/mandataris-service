import multer from 'multer';
import { documentedRouter } from '../util/documented-router';
import { commonErrorResponses } from '../util/openapi';
import { onBurgemeesterBenoeming } from '../controllers/burgemeester-benoeming';

const burgemeesterRouter = documentedRouter();

const upload = multer({ dest: '/uploads/' });

burgemeesterRouter.post(
  '/',
  {
    tags: ['Mayor appointment'],
    summary: 'Process a mayor appointment or rejection',
    operationId: 'processMayorAppointment',
    description:
      'Processes the appointment or rejection of a mayor based on a decision document. Required fields include `bestuurseenheidUri`, `burgemeesterUri`, `status`, and `datum`, plus the uploaded `file`.',
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: [
              'bestuurseenheidUri',
              'burgemeesterUri',
              'status',
              'datum',
              'file',
            ],
            properties: {
              bestuurseenheidUri: {
                type: 'string',
                format: 'uri',
                description: 'URI of the municipality.',
              },
              burgemeesterUri: {
                type: 'string',
                format: 'uri',
                description: 'URI of the appointed or rejected mayor.',
              },
              status: {
                type: 'string',
                description: 'Appointment or rejection status.',
              },
              datum: {
                type: 'string',
                description: 'Date of the appointment or rejection.',
              },
              file: {
                type: 'string',
                format: 'binary',
                description: 'The decision document.',
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'The mayor appointment or rejection was processed.',
      },
      ...commonErrorResponses,
    },
  },
  upload.single('file'),
  onBurgemeesterBenoeming,
);

export { burgemeesterRouter };

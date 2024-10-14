import json
from contextlib import contextmanager
from requests import Session, PreparedRequest, Response
from psycopg2 import IntegrityError
from unittest.mock import patch

from odoo.exceptions import ValidationError, UserError
from odoo.tests.common import tagged, TransactionCase, freeze_time
from odoo.tools import mute_logger

ID_CLIENT = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
FAKE_UUID = 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'
PDF_FILE_PATH = 'account_peppol/tests/assets/peppol_identification_test.pdf'

@freeze_time('2023-01-01')
@tagged('-at_install', 'post_install')
class TestPeppolParticipant(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['ir.config_parameter'].sudo().set_param('account_peppol.edi.mode', 'test')

    @classmethod
    def _get_mock_responses(cls):
        participant_state = cls.env.context.get('participant_state', 'receiver')
        return {
            '/api/peppol/2/participant_status': {
                'result': {
                    'peppol_state': participant_state,
                }
            },
            '/iap/account_edi/2/create_user': {
                'result': {
                    'id_client': ID_CLIENT,
                    'refresh_token': FAKE_UUID,
                }
            },
            '/api/peppol/1/update_user': {'result': {}},
            '/api/peppol/1/migrate_peppol_registration': {
                'result': {
                    'migration_key': 'test_key',
                }
            },
            '/api/peppol/1/register_sender': {'result': {}},
            '/api/peppol/1/register_receiver': {'result': {}},
            '/api/peppol/1/register_sender_as_receiver': {'result': {}},
        }

    @classmethod
    def _request_handler(cls, s: Session, r: PreparedRequest, /, **kw):
        response = Response()
        response.status_code = 200
        if r.url.endswith('/iso6523-actorid-upis%3A%3A9925%3A0000000000'):
            response.status_code = 404
            return response

        if r.url.endswith('/iso6523-actorid-upis%3A%3A0208%3A0000000000'):
            response._content = b'<?xml version=\'1.0\' encoding=\'UTF-8\'?>\n<smp:ServiceGroup xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:id="http://busdox.org/transport/identifiers/1.0/" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:smp="http://busdox.org/serviceMetadata/publishing/1.0/"><id:ParticipantIdentifier scheme="iso6523-actorid-upis">0208:0000000000</id:ParticipantIdentifier></smp:ServiceGroup>'
            return response

        url = r.path_url
        body = json.loads(r.body)
        responses = cls._get_mock_responses()
        if (
            url == '/api/peppol/2/register_participant'
            and cls.env.context.get('migrate_to')
            and not body['params'].get('migration_key')
        ):
            raise UserError('No migration key was provided')

        if cls.env.context.get('migrated_away'):
            response.json = lambda: {
                'result': {
                    'proxy_error': {
                        'code': 'no_such_user',
                        'message': 'The user does not exist on the proxy',
                    }
                }
            }
            return response

        if url not in responses:
            return super()._request_handler(s, r, **kw)
        response.json = lambda: responses[url]
        return response

    def _get_participant_vals(self):
        return {
            'peppol_eas': '9925',
            'peppol_endpoint': '0000000000',
            'phone_number': '+32483123456',
            'contact_email': 'yourcompany@test.example.com',
        }

    @contextmanager
    def _set_context(self, other_context):
        cls = self.__class__
        env = cls.env
        env = env(context=dict(env.context, **other_context))
        with patch(cls, "env", env):
            yield

    def test_create_participant_missing_data(self):
        # creating a participant without eas/endpoint/document should not be possible
        wizard = self.env['peppol.registration'].create({
            'peppol_eas': False,
            'peppol_endpoint': False,
        })
        with self.assertRaises(ValidationError), self.cr.savepoint():
            wizard.button_register_peppol_participant()

    def test_create_participant_already_exists(self):
        # creating a receiver participant that already exists on Peppol network should not be possible
        vals = self._get_participant_vals()
        vals['peppol_eas'] = '0208'
        wizard = self.env['peppol.registration'].create(vals)
        with self.assertRaises(UserError):
            wizard.button_register_peppol_participant()

    def test_create_success_sender(self):
        # should be possible to apply with all data
        # the account_peppol_proxy_state should correctly change to sender
        # then the account_peppol_proxy_state should not change
        # after running the cron checking participant status
        company = self.env.company
        wizard = self.env['peppol.registration'].create({'smp_registration': False, **self._get_participant_vals()})
        wizard.button_register_peppol_participant()
        # since we did not select receiver registration, we're now just a sender
        self.assertEqual(company.account_peppol_proxy_state, 'sender')
        # running the cron should not do anything for the company
        with self._set_context({'participant_state': 'sender'}):
            self.env['account_edi_proxy_client.user']._cron_peppol_get_participant_status()
        self.assertEqual(company.account_peppol_proxy_state, 'sender')

    def test_create_success_receiver(self):
        # should be possible to apply with all data
        # the account_peppol_proxy_state should correctly change to smp_registration
        # then the account_peppol_proxy_state should change successfully
        # after checking participant status
        company = self.env.company
        wizard = self.env['peppol.registration'].create(self._get_participant_vals())
        wizard.smp_registration = True  # choose to register as a receiver right away
        wizard.button_register_peppol_participant()
        self.assertIn(company.account_peppol_proxy_state, ('smp_registration', 'receiver'))

    def test_create_success_receiver_two_steps(self):
        # it should be possible to first register as a sender in the wizard
        # and then come back to settings and register as a receiver
        # first step: use the peppol wizard to register only as a sender
        company = self.env.company
        wizard = self.env['peppol.registration'].create({'smp_registration': False, **self._get_participant_vals()})
        wizard.button_register_peppol_participant()
        self.assertEqual(company.account_peppol_proxy_state, 'sender')
        # second step: open settings and register as a receiver
        settings = self.env['res.config.settings'].create({})
        settings.button_peppol_register_sender_as_receiver()
        self.assertIn(company.account_peppol_proxy_state, ('smp_registration', 'receiver'))
        self.env['account_edi_proxy_client.user']._cron_peppol_get_participant_status()
        self.assertEqual(company.account_peppol_proxy_state, 'receiver')

    def test_create_reject_participant(self):
        # the account_peppol_proxy_state should change to rejected
        # if we reject the participant
        company = self.env.company
        wizard = self.env['peppol.registration'].create(self._get_participant_vals())
        with self._set_context({'participant_state': 'rejected'}):
            wizard = wizard.with_env(self.env)
            wizard.button_register_peppol_participant()
            company.account_peppol_proxy_state = 'smp_registration'
            self.env['account_edi_proxy_client.user']._cron_peppol_get_participant_status()
            self.assertEqual(company.account_peppol_proxy_state, 'rejected')

    @mute_logger('odoo.sql_db')
    def test_create_duplicate_participant(self):
        # should not be possible to create a duplicate participant
        wizard = self.env['peppol.registration'].create(self._get_participant_vals())
        wizard.button_register_peppol_participant()
        with self.assertRaises(IntegrityError), self.cr.savepoint():
            wizard.account_peppol_proxy_state = 'not_registered'
            wizard.button_register_peppol_participant()

    def test_migrate_away_participant(self):
        # a participant should be able to request a migration key
        wizard = self.env['peppol.registration'].create(self._get_participant_vals())
        wizard.button_register_peppol_participant()
        # migrating away is only possible in the settings
        settings = self.env['res.config.settings'].create({})
        settings.button_peppol_migrate_away()
        self.assertEqual(settings.company_id.account_peppol_proxy_state, 'receiver')
        self.assertEqual(settings.account_peppol_migration_key, 'test_key')

    def test_reset_participant(self):
        # once a participant has migrated away, they should be reset
        wizard = self.env['peppol.registration'].create(self._get_participant_vals())
        wizard.button_register_peppol_participant()
        wizard.account_peppol_proxy_state = 'receiver'
        settings = self.env['res.config.settings'].create({})
        settings.button_peppol_migrate_away()

        with self._set_context({'migrated_away': True}):
            settings = settings.with_env(self.env)
            try:
                settings.button_peppol_update_user_data()
            except UserError:
                settings = self.env['res.config.settings'].create({})
                self.assertRecordValues(settings, [{
                        'account_peppol_migration_key': False,
                        'account_peppol_proxy_state': 'not_registered',
                    }],
                )
                self.assertFalse(self.env.company.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'peppol'))
            else:
                raise ValidationError('A UserError should be raised.')

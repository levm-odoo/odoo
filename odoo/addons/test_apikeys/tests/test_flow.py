import logging
import json

from odoo import api
from odoo.tests import tagged, get_db_name
from odoo.addons.base.tests.common import HttpCaseWithUserDemo
from odoo.addons.auth_totp.tests.test_totp import TestTOTPMixin

_logger = logging.getLogger(__name__)


@tagged('post_install', '-at_install')
class TestAPIKeys(HttpCaseWithUserDemo, TestTOTPMixin):
    def setUp(self):
        super().setUp()

        self.messages = []
        @api.model
        def log(inst, *args, **kwargs):
            self.messages.append((inst, args, kwargs))
        self.registry['ir.logging'].send_key = log
        @self.addCleanup
        def remove_callback():
            del self.registry['ir.logging'].send_key

    def test_addremove(self):
        db = get_db_name()
        self.start_tour('/web', 'apikeys_tour_setup', login='demo')
        demo_user = self.env['res.users'].search([('login', '=', 'demo')])
        self.assertEqual(len(demo_user.api_key_ids), 1, "the demo user should now have a key")

        [(_, [key], [])] = self.messages

        uid = self.xmlrpc_common.authenticate(db, 'demo', key, {})
        [r] = self.xmlrpc_object.execute_kw(
            db, uid, key,
            'res.users', 'read', [uid, ['login']]
        )
        self.assertEqual(
            r['login'], 'demo',
            "the key should be usable as a way to perform RPC calls"
        )
        self.start_tour('/web', 'apikeys_tour_teardown', login='demo')

    def test_apikeys_totp(self):
        db = get_db_name()
        self.install_totphook()
        self.start_tour('/web', 'apikeys_tour_setup', login='demo')
        self.start_tour('/web', 'totp_tour_setup', login='demo')
        [(_, [key], [])] = self.messages  # pylint: disable=unbalanced-tuple-unpacking
        uid = self.xmlrpc_common.authenticate(db, 'demo', key, {})
        self.assertEqual(uid, self.env.ref('base.user_demo').id)

# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import HttpCase, tagged

from odoo.addons.auth_totp.tests.test_totp import TestTOTPMixin


@tagged('post_install', '-at_install')
class TestTOTPInvite(TestTOTPMixin, HttpCase):

    def test_totp_administration(self):
        self.install_totphook()
        self.start_tour('/odoo', 'totp_admin_invite', login='admin')
        self.start_tour('/odoo', 'totp_admin_self_invite', login='admin')

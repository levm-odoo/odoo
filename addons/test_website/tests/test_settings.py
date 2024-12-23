# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import HttpCase, tagged


@tagged('-at_install', 'post_install')
class TestWebsiteSettings(HttpCase):

    def test_01_multi_website_settings(self):
        self.env['website'].create({'name': "Website Test Settings", 'specific_user_account': True})
        self.start_tour("/odoo", 'website_settings_m2o_dirty', login="admin")

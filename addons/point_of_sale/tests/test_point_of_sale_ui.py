# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import HttpCase, tagged
from odoo import tools


@tagged('post_install', '-at_install')
class TestUi(HttpCase):

	# Avoid "A Chart of Accounts is not yet installed in your current company."
	# Everything is set up correctly even without installed CoA
    @tools.mute_logger('odoo.http')
    def test_01_point_of_sale_tour(self):

        self.start_tour("/web", 'point_of_sale_tour', login="admin")

    @tools.mute_logger('odoo.http')
    def test_point_of_sale_furnitures_scenario_tour(self):
        self.env['pos.session'].sudo().search([('state', '!=', 'closed')]).close_session_from_ui()
        self.env['pos.config'].search([]).action_archive()
        self.env['pos.category'].search([('name', 'ilike', 'Misc')], limit=1).unlink()
        self.start_tour("/web", 'point_of_sale_furnitures_scenario_tour', login="admin")

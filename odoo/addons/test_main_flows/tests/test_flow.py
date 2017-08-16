# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo.tests


@odoo.tests.common.at_install(False)
@odoo.tests.common.post_install(True)
class TestUi(odoo.tests.HttpCase):
    
    def test_01_main_flow_tour(self):
        self.chrome_headless("/web", "odoo.__DEBUG__.services['web_tour.tour'].run('main_flow_tour')", "odoo.__DEBUG__.services['web_tour.tour'].tours.main_flow_tour.ready", login="admin", timeout=180)

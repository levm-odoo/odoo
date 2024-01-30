# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo.tests


class TestWebsitePageManager(odoo.tests.HttpCase):
    def test_page_manager_test_model(self):
        if self.env['website'].search_count([]) == 1:
            website2 = self.env['website'].create({
                'name': 'My Website 2',
                'domain': '',
                'sequence': 20,
            })
        else:
            website2 = self.env['website'].search([], order='id desc', limit=1)
        self.env['test.model'].create({'name': 'Test Model Website 2', 'website_id': website2.id})
        self.assertTrue(
            len(set([t.website_id.id for t in self.env['test.model'].search([])])) >= 3,
            "There should at least be one record without website_id and one for 2 different websites",
        )
        self.start_tour('/web#action=test_website.action_test_model', 'test_website_page_manager', login="admin")
        # This second test is about ensuring that you can switch from a list
        # view which has no `website_pages_list` js_class to its kanban view
        self.start_tour('/web#action=test_website.action_test_model_js_class_bug', 'test_website_page_manager_js_class_bug', login="admin")

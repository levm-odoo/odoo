# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import tagged, HttpCase

# To start the tests:
# --test-tags knowledge_tour_tests

@tagged('post_install', '-at_install', 'knowledge_tour_tests')
class TestUI(HttpCase):
    def test_knowledge_share(self):
        self.start_tour('/web', 'knowledge_share', login='admin')

    def test_knowledge_editor_display(self):
        self.start_tour('/web', 'knowledge_editor_display', login='admin')

    def test_knowledge_chatter_icon(self):
        self.start_tour('/web', 'tour_chatter_button', login='admin')

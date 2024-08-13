# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import TransactionCase


class TestPhonenumbersBlacklist(TransactionCase):
    def test_sanitize_search(self):
        """ Test that when using search, the number is sanitized """
        blacklist = self.env['phone.blacklist']
        blacklist.create({'number': '+917589632587'})

        res = blacklist.search([('number', 'in', ['+917 5896 32587'])])

        self.assertEqual(len(res), 1, "There should be one result")

    def test_MX_blacklist(self):
        """ Test that we can add a MX number to the blacklist """
        blacklist = self.env['phone.blacklist']
        blacklist.create({'number': '+527201020711'})
        res = blacklist.search([('number', 'in', ['+527201020711'])])
        self.assertEqual(len(res), 1, "There should be one result")

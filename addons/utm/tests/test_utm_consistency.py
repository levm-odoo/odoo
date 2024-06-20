# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.utm.tests.common import TestUTMCommon
from odoo.exceptions import UserError
from odoo.tests.common import tagged, users


@tagged('post_install', '-at_install', 'utm', 'utm_consistency')
class TestUTMConsistency(TestUTMCommon):

    @users('__system__')
    def test_utm_consistency(self):
        """ You are not supposed to delete records from the 'utm_mixin.SELF_REQUIRED_UTM_REF' list.
        Indeed, those are essential to functional flows.
        e.g: The source 'Mass Mailing' and the medium 'Email' are used within Mass Mailing, HR, ...
        Deleting those records would prevent meaningful statistics and render UTM useless. """

        for xml_id in self.env['utm.mixin'].SELF_REQUIRED_UTM_REF:
            with self.assertRaises(UserError):
                self.env.ref(xml_id).unlink()

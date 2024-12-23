# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.base.tests.common import BaseCommon


class UomCommon(BaseCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.uom_gram = cls.quick_ref('uom.product_uom_gram')
        cls.uom_kgm = cls.quick_ref('uom.product_uom_kgm')
        cls.uom_ton = cls.quick_ref('uom.product_uom_ton')
        cls.uom_unit = cls.quick_ref('uom.product_uom_unit')
        cls.uom_dozen = cls.quick_ref('uom.product_uom_dozen')
        cls.uom_hour = cls.quick_ref('uom.product_uom_hour')

        cls.group_uom = cls.quick_ref('uom.group_uom')

        # Ensure uom group is disabled by default, to make tests more deterministic, not relying on
        # existing database configuration (e.g. implied when sale_timesheet is installed, ...)
        if cls.group_uom in cls.group_user.implied_ids:
            cls.group_user._remove_group(cls.group_uom)

    @classmethod
    def _enable_uom(cls):
        cls._enable_feature(cls.group_uom)

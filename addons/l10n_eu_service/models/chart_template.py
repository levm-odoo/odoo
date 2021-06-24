# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _

class AccountChartTemplate(models.Model):
    _inherit = 'account.chart.template'

    def _load(self, sale_tax_rate, purchase_tax_rate, company):
        rslt = super()._load( sale_tax_rate, purchase_tax_rate, company)

<<<<<<< HEAD
        if company.account_tax_fiscal_country_id in self.env.ref('base.europe').country_ids:
=======
        if company.country_id in self.env.ref('base.europe').country_ids:
>>>>>>> 64abde8dc6f... temp
            company._map_eu_taxes()

        return rslt

# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class AccountIncoterms(models.Model):
    _name = 'account.incoterms'
    _description = 'Incoterms'

    name = fields.Char(
        'Name', required=True, translate=True,
        help="Incoterms are series of sales terms. They are used to divide transaction costs and responsibilities between buyer and seller and reflect state-of-the-art transportation practices.")
    code = fields.Char(
        'Code', size=3, required=True,
        help="Incoterms Standard Code")
    active = fields.Boolean(
        'Active', default=True,
        help="By unchecking the active field, you may hide INCOTERMS you will not use.")

    @api.depends('code')
    def _compute_display_name(self):
        for incoterms in self:
            incoterms.display_name = '%s%s' % (incoterms.code and '[%s] ' % incoterms.code or '', incoterms.name)

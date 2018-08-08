# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    l10n_in_gstin_partner_id = fields.Many2one(
        'res.partner', string="GSTIN", required=True, domain="[('l10n_in_gstin_company_id', '=', company_id)]",
        default=lambda self: self.env['res.company']._company_default_get('pos.config').partner_id,
    )
    l10n_in_place_of_supply = fields.Many2one('res.country.state', string="Place Of Supply", domain=[("country_id.code", "=", "IN")])

    @api.onchange('stock_location_id', 'company_id')
    def _onchange_l10n_in_pos_gstin_partner(self):
        gstin_partner = self.stock_location_id.get_warehouse().l10n_in_gstin_partner_id
        self.l10n_in_gstin_partner_id = gstin_partner or self.company_id.partner_id

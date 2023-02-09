# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, _
from odoo.exceptions import UserError
from odoo.tools import html_escape


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"


    account_advance_payment_tax_account_id = fields.Many2one(
        comodel_name="account.account",
        related="company_id.account_advance_payment_tax_account_id",
        string="Advance Payment Tax Account",
        readonly=False,
        domain="[('deprecated', '=', False), ('company_id', '=', company_id)]")


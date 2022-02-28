# -*- coding: utf-8 -*-
from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    company_registry = fields.Char(
        string='Company registry/KVK-nummer', related='partner_id.company_registry', readonly=False)
    l10n_nl_oin = fields.Char(related='partner_id.l10n_nl_oin', readonly=False)

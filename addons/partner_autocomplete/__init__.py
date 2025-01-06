# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models

from odoo import api, SUPERUSER_ID

def uninstall_hook(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    if partner_autocomplete := env['iap.account'].search([('service_name', '=', 'partner_autocomplete')]):
        partner_autocomplete.unlink()

# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers
from . import models
from . import tools
from . import wizard

from odoo import api, SUPERUSER_ID

def uninstall_hook(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    if sms := env['iap.account'].search([('service_name', '=', 'sms')]):
        sms.unlink()

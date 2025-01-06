# -*- coding: utf-8 -*-

from . import models
from . import country_utils
from . import wizard

from odoo import api, SUPERUSER_ID

def uninstall_hook(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    if snailmail := env['iap.account'].search([('service_name', '=', 'snailmail')]):
        snailmail.unlink()

# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers
from . import models
from . import report
from . import wizard
from . import populate


from odoo import api, SUPERUSER_ID


# TODO: Apply proper fix & remove in master
def pre_init_hook(cr):
    env = api.Environment(cr, SUPERUSER_ID, {})
    env['ir.model.data'].search([
        ('model', 'like', '%stock%'),
        ('module', '=', 'stock')
    ]).unlink()

def _assign_default_mail_template_picking_id(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    company_ids_without_default_mail_template_id = env['res.company'].search([
        ('stock_mail_confirmation_template_id', '=', False)
    ])
    default_mail_template_id = env.ref('stock.mail_template_data_delivery_confirmation', raise_if_not_found=False)
    if default_mail_template_id:
        company_ids_without_default_mail_template_id.write({
            'stock_mail_confirmation_template_id': default_mail_template_id.id,
        })

def uninstall_hook(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    picking_type_ids = env["stock.picking.type"].with_context({"active_test": False}).search([])
    picking_type_ids.sequence_id.unlink()

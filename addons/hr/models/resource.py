# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResourceResource(models.Model):
    _inherit = "resource.resource"

    user_id = fields.Many2one(copy=False) # NO need of a compute depending on employee_id ???? (same for employee id)
    employee_id = fields.One2many('hr.employee', 'resource_id', check_company=True)

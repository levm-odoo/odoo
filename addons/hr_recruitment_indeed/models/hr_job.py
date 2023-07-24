# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class Job(models.Model):
    _inherit = "hr.job"

    salary = fields.Char(string="Salary range")

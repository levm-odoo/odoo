# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields


class ProjectTask(models.Model):
    _inherit = 'project.task'

    # Deprecated: To be removed in master.
    email_from = fields.Char('Email From')

# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields


class ProjectTask(models.Model):
    _inherit = 'project.task'

    email_from = fields.Char('Email From', inverse='_inverse_email_from')

    def _inverse_email_from(self):
        records_with_email = self.filtered(lambda r: r.email_from)
        partners = self.env['res.partner'].search([('email', 'in', records_with_email.mapped('email_from'))])
        email_to_partner = {partner.email: partner.id for partner in partners}
        for record in records_with_email:
            record.partner_id = email_to_partner.get(record.email_from, False)

from odoo import models, fields

class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    stripe_cardholder_ident = fields.Char(
        string="Stripe Identification Number",
    )

    _stripe_cardholder_uniq = models.Constraint(
        'UNIQUE(stripe_cardholder_ident)',
        'An employee is already linked to that stripe cardholder.',
    )

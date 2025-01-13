from odoo import fields, models

class StripeCardholderWizard(models.Transient):
    _name = 'stripe.cardholder.wizard'

    name = fields.Char()
    email = fields.Char()
    phone_number= fields.Char()
    status = fields.Boolean()
    first_name = fields.Char()
    last_name = fields.Char()
    date_of_birth = fields.Date()
    billing_address_num = fields.Integer()
    billing_address_street = fiels.Char()
    billing_address_city = fields.Char()
    billing_address_postal_code = fields.Char()
    billing_address_country = fields.Char()

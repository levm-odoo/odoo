from odoo import models, fields

class estatePropertyOffer(models.Model):
    _name = 'estate.property.offers'
    _description='About estate property offer'

    price = fields.Float(string="price")
    partner_id = fields.Many2one("res.partner", string="Partner",required=True)
    status = fields.Selection(selection=[('accepted','Accepted'),('refused','Refused')],string="Status")
    property_id = fields.Many2one("estate.property", string='Property',required=True)

from odoo import models ,fields

class users(models.Model):
    _inherit = 'res.users'

    property_ids = fields.One2many('estate.property','salesman_id',string="property_ids")
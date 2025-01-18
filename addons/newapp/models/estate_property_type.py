from odoo import models, fields

class estatePropertyType(models.Model):
    _name = 'estate.property.type'
    _description='About estate property type'

    name = fields.Char(string="name",  required=True)
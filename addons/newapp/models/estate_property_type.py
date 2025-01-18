from odoo import models, fields

class estatePropertyType(models.Model):
    _name = 'estate.property.type'
    _description='About estate property type'

    name = fields.Char(string="name",  required=True)

    _sql_constraints = [
        ('name_unique', 'UNIQUE(name)', 'The property type name must be unique')
    ]

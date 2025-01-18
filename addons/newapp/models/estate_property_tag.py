from odoo import models, fields

class estatePropertyTag(models.Model):
    _name = 'estate.property.tag'
    _description='About estate property tags'

    name = fields.Char(string="name",  required=True)

    _sql_constraints = [
        ('name_unique', 'UNIQUE(name)', 'The property tag name must be unique')
    ]

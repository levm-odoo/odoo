from odoo import models, fields

class estatePropertyTag(models.Model):
    _name = 'estate.property.tag'
    _description='About estate property tags'
    _order='name'


    name = fields.Char(string="name",  required=True)
    color = fields.Integer('color')

    # _sql_constraints=[('name_unique','UNIQUE(name)','Enter a unique tag')]

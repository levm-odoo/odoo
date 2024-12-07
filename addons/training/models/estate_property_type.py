from odoo import models, fields, api

class estatePropertyType(models.Model):
    _name = 'estate.property.type'
    _description='About estate property type'
    _order='sequence asc, name asc'

    sequence = fields.Integer('Sequence')
    name = fields.Char(string="name",  required=True)
    property_ids = fields.One2many('estate.property','property_type_id', string="properties")

    offer_ids = fields.One2many('estate.property.offers', 'property_type_id', string='offers')
    offer_count = fields.Integer(string="Offer Count", compute="_compute_offer_count")

    # _sql_constraints=[('name_unique','UNIQUE(name)','Enter a unique tag')]

    @api.depends('offer_ids')
    def _compute_offer_count(self):
        for record in self:
            record.offer_count = len(record.offer_ids)

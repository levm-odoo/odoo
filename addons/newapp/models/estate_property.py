from odoo import models, fields
from dateutil.relativedelta import relativedelta
class estateProperty(models.Model):
    _name = 'estate.property'
    _description = 'about property'

    name = fields.Char(string="name", required=True)
    description = fields.Text(string="description")
    postcode = fields.Char(string="postcode")
    date_availability = fields.Date(string="date_availability",default=lambda self: fields.Date.today() + relativedelta(months=3), copy=False)
    expected_price = fields.Float(string="expected_price", required=True)
    selling_price = fields.Float(string="selling_price", readonly=True, copy=False)
    bedrooms = fields.Integer(string="bedrooms", default=2)
    living_area = fields.Integer(string="living_area")
    facades = fields.Integer(string="facades")
    garage = fields.Boolean(string="garage")
    garden = fields.Boolean(string="garden")
    garden_area = fields.Integer(string="garden_area")
    garden_orientation = fields.Selection(
        selection=[
            ('N', 'North'),
            ('W', 'West'),
            ('E', 'East'),
            ('S', 'South'),
        ],
        string="garden_orientation"
    )
    active = fields.Boolean(string="active",default=True)
    state = fields.Selection(
        [
            ('new', 'New'),
            ('offer received', 'Offer Received'),
            ('offer accepted', 'Offer Accepted'),
            ('sold', 'Sold'),
            ('cancelled', 'Cancelled')
        ],
        string="Status",
        default='new',
        required=True
    )
    salesman_id = fields.Many2one('res.users', default=lambda self: self.env.user, string="Salesman")
    buyer_id = fields.Many2one('res.partner', string='Buyer', readonly=True, copy=False)
    property_type_id = fields.Many2one('estate.property.type', string='property type')
    tag_ids = fields.Many2many('estate.property.tag', string="tags")
    offer_ids = fields.One2many('estate.property.offers', 'property_id', string='offer ids')
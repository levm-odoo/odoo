from odoo import models, fields, api, exceptions, _
from dateutil.relativedelta import relativedelta
from odoo.exceptions import UserError
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
            ('offer_received', 'Offer Received'),
            ('offer_accepted', 'Offer Accepted'),
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

    total_area = fields.Float(string="Total Area", compute='_compute_total_area')
    best_price = fields.Float(string='best_price', compute='_compute_best_price')


    _sql_constraints = [
        ('expected_price_positive', 'CHECK(expected_price > 0)', 'Expected Price must be strictly positive!'),
        ('selling_price_positive', 'CHECK(selling_price > 0)', 'Selling Price must be positive!'),
    ]

    @api.depends('living_area','garden_area')
    def _compute_total_area(self):
        for record in self:
            record.total_area = record.living_area + record.garden_area

    @api.depends('offer_ids')
    def _compute_best_price(self):
        for record in self:
            record.best_price = max(record.offer_ids.mapped('price'), default=0)

    @api.onchange('garden')
    def _onchange_garden(self):
        if self.garden:
            self.garden_area = 10
            self.garden_orientation = 'N'
        else:
            self.garden_area = 0
            self.garden_orientation = False

    def action_sold(self):
        if self.state == 'cancelled':
            raise exceptions.UserError(_('A sold property cannot be cancelled.'))
        else:
            self.state = 'sold'

    def action_cancel(self):
        if self.state == 'sold':
            raise exceptions.UserError(_('A cancelled property cannot be sold.'))
        else:
            self.state = 'sold'

    @api.constrains('selling_price')
    def _check_lower_selling_price(self):
        for record in self:
            lower_price = (record.expected_price * 9)/10
            if record.selling_price <= lower_price:
                raise UserError("The selling price cannot be lower than 90% of the expected price")

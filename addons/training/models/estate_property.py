from odoo import models, fields, api, exceptions, _
from dateutil.relativedelta import relativedelta
from odoo.exceptions import ValidationError,UserError
import odoo.tools.float_utils as floatUtil

class estateProperty(models.Model):
    _name = 'estate.property'
    _description = 'about estate'
    _order = 'id desc'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    # def _default_date_availability(self):
    #     return fields.Date.today() + relativedelta(months=3)

    name = fields.Char(string="name", required=True)
    description = fields.Text(string="description")
    postcode = fields.Char(string="postcode")
    date_availability = fields.Date(string="date_availability",default=lambda self: fields.Date.today() + relativedelta(months=3),copy=False)
    expected_price = fields.Float(string="expected_price", required=True)
    selling_price = fields.Float(string="selling_price", readonly=True, copy=False)
    bedrooms = fields.Integer(string="bedrooms",default=2)
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
        selection=[
            ('new', 'New'),
            ('offer_received', 'Offer Received'),
            ('offer_accepted', 'Offer Accepted'),
            ('sold', 'Sold'),
            ('canceled', 'Canceled'),
        ],
        string="status",
        required=True,
        default='new',
        copy=False,
    )

                            # relational fields

    property_type_id = fields.Many2one('estate.property.type',string='Property Type')
    salesman_id = fields.Many2one('res.users',default=lambda self: self.env.user, string="Salesman")
    buyer_id = fields.Many2one('res.partner',string='Buyer', readonly=True, copy=False)
    tag_ids = fields.Many2many('estate.property.tag', string="tags")
    offer_ids = fields.One2many('estate.property.offers','property_id',string='Offers')

                            # compute fields

    total_area = fields.Float(compute='_compute_total_area', string='total_area')
    best_offer = fields.Float(string="best_offer", compute='_compute_best_offer')
                            # it should be created while giving record rules
    company_id = fields.Many2one(comodel_name="res.company", string="related company", required=True, default=lambda self: self.env.user.company_id)
    image = fields.Binary(string='image')




    @api.depends('living_area', 'garden_area')
    def _compute_total_area(self):
        for record in self:
            record.total_area = record.living_area + record.garden_area

    @api.depends('offer_ids')
    def _compute_best_offer(self):
        for record in self:
            record.best_offer = max(record.offer_ids.mapped('price'), default=0)


                            # onchanges
    @api.onchange("garden")
    def _onchange_garden(self):
        if self.garden:
            self.garden_area = 10
            self.garden_orientation = 'N'
        else:
            self.garden_area = 0
            self.garden_orientation = False

                           # action buttions
    def action_sold (self):
        if self.state == 'canceled':
            raise exceptions.UserError(_('A sold property cannot be cancelled.'))
        else:
            self.state = 'sold'

    def action_canceled(self):
        if self.state == 'sold':
            raise exceptions.UserError(_('A cancelled property cannot be sold'))
        else:
            self.state= 'canceled'

                    # python constrains

    @api.constrains('selling_price')
    def _check_selling_price(self):
        for record in self:
            if record.selling_price < 0 :
                raise ValidationError(_('selling price must be positive'))


    @api.constrains('expected_price')
    def _check_expected_price(self):
        for record in self:
            if record.expected_price <= 0 :
                raise ValidationError(_('expected price must be positive'))


    # @api.constrains('best_offer')
    # def _check_best_offer(self):
    #     for record in self:
    #         if record.best_offer < 0 :
    #             raise ValidationError(_(" The best_offer must be strictly positive"))

    @api.constrains('selling_price', 'expected_price') #python constraints
    def _check_selling_price_not_to_be_less_90_per_of_expected_price(self):
        for records in self:
            if(floatUtil.float_is_zero(value=records.selling_price, precision_digits=2)):
                continue
            else:
                #90% of expected price
                per_90_of_expected_price= records.expected_price * (90/100)
                if(floatUtil.float_compare(value1=records.selling_price, value2=per_90_of_expected_price, precision_digits=2) == -1):
                    raise ValidationError(_("The selling price cannot be lower than 90% of the expected price"))


    def unlink(self):
        for record in self:
            if record.state not in('new','canceled'):
                raise UserError(_("only new and cancelled properties can be deleted"))
            return super().unlink()

    def action_add_offer(self):
        return {
            'name': 'add_info',
            'type': 'ir.actions.act_window',
            'view_type': 'form',
            'view_mode': 'form',
            'res_model': 'wizards.offers',
            'target':'new'
        }

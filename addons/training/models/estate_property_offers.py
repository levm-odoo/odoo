from odoo import models, fields, api
from dateutil.relativedelta import relativedelta
from odoo.tools import float_compare
from odoo.exceptions import UserError

class estatePropertyOffer(models.Model):
    _name = 'estate.property.offers'
    _description='About estate property offer'
    _order='price desc'

    price = fields.Float(string="price")
    partner_id = fields.Many2one("res.partner", string="Partner",required=True)
    status = fields.Selection(selection=[('accepted','Accepted'),('refused','Refused')],string="Status")
    property_id=fields.Many2one("estate.property", string='Property',required=True)
    validity = fields.Integer(string='Validity', default=7)
    date_deadline = fields.Date('Deadline', compute="_compute_date_deadline", inverse="_inverse_date_deadline")
    property_type_id = fields.Many2one(
        related='property_id.property_type_id',
        string="Property Type",
        readonly=True,
        store=True
    )


    @api.depends("validity","create_date")
    def _compute_date_deadline(self):
        for record in self:
            record.date_deadline = fields.Date.today() + relativedelta(days=record.validity)



    # valdity is default 7 ..if user manually changes the date deadline then validity will updatenwhile saving the record
    def _inverse_date_deadline(self):
        for record in self:
            record.validity = (record.date_deadline - fields.Date.today()).days

                        # action buttons
    def action_accepted(self):
        self.status = "accepted"
        self.property_id.selling_price = self.price
        self.property_id.buyer_id = self.partner_id.id
        self.property_id.state = "offer_accepted"

    def action_refused(self):
        self.status = 'refused'
        self.property_id.selling_price = 0

                        # python constrains

    # @api.model
    # def create(self, vals):
    #     estate_property_ref = self.env['estate.property'].browse(vals['property_id'])
    #     best_price= estate_property_ref.best_offer
    #     if vals['price'] < best_price:
    #         raise UserError(f"The offer must be higher than the {best_price}")
    #     estate_property_ref.state='offer_received'
    #     return super().create(vals)

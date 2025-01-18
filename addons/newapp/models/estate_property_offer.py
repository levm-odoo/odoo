from odoo import models, fields, api
from dateutil.relativedelta import relativedelta

class estatePropertyOffer(models.Model):
    _name = 'estate.property.offers'
    _description='About estate property offer'

    price = fields.Float(string="price")
    partner_id = fields.Many2one("res.partner", string="Partner",required=True)
    status = fields.Selection(selection=[('accepted','Accepted'),('refused','Refused')],string="Status")
    property_id = fields.Many2one("estate.property", string='Property',required=True)
    validity = fields.Integer(string='Validity', default=7)
    date_deadline = fields.Date(string='date_deadline', compute="_compute_date_deadline", inverse="_inverse_date_deadline")


    @api.depends("validity","create_date")
    def _compute_date_deadline(self):
        for record in self:
            record.date_deadline = fields.Date.today() + relativedelta(days=record.validity)


    # valdity is default 7 ..if user manually changes the date deadline then validity will updatenwhile saving the record
    def _inverse_date_deadline(self):
        for record in self:
            record.validity = (record.date_deadline - fields.Date.today()).days

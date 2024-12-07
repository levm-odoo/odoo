from odoo import models ,fields

class Wizards(models.TransientModel):
    _name='wizards.offers'
    _description='About wizards'

    partner_id = fields.Many2one('res.partner',copy=False,string='Buyer')
    price = fields.Float(string="price")
    status = fields.Selection(selection=[('accepted','Accepted'),('refused','Refused')],string="Status",copy=False)

    def action_make_offer(self):
        for prop in self.env['estate.property'].browse(self._context['active_ids']):
            if prop.state in ['new','offer_received']:
                records=[
                    {
                        'price' : self.price,
                        'partner_id':self.partner_id.id,
                        'property_id':prop.id
                    }
                ]
                self.env['estate.property.offers'].create(records)

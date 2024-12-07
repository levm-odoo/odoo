from odoo import models, fields
from odoo import Command

class EstateProperty(models.Model):
    _inherit = 'estate.property'


    def action_sold (self):
        print("mark_property_sold in estate account")
        self.env['account.move'].create({
            'partner_id': self.buyer_id.id ,
            'move_type' : 'out_invoice',
            'invoice_line_ids':[
                Command.create(
                    {
                    'name':self.name,
                    'quantity' :1,
                    'price_unit':self.selling_price * 0.06,
                    },
                ),
                Command.create(
                    {
                    'name':'administrative fees',
                    'quantity' :1,
                    'price_unit':100.00,
                    },
                )
            ],
        })
        return super().action_sold()

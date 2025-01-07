from odoo import api, fields, models
import json


class PosReceiptLayout(models.TransientModel):
    _name = "pos.receipt.layout"
    _description = 'POS Receipt Layout'

    def _default_pos_config(self):
        return self.env['pos.config'].search([('company_id', '=', self.env.company.id)], order='write_date desc', limit=1)

    pos_config_id = fields.Many2one('pos.config', string="Point of Sale", default=lambda self: self._default_pos_config(), required=True)
    receipt_layout = fields.Selection(related="pos_config_id.receipt_layout", readonly=False, required=True)
    receipt_logo = fields.Binary(related="pos_config_id.receipt_logo", readonly=False)
    receipt_bg = fields.Selection(related='pos_config_id.receipt_bg', readonly=False)
    receipt_bg_image = fields.Binary(related="pos_config_id.receipt_bg_image", readonly=False)
    receipt_header = fields.Html(related="pos_config_id.receipt_header", readonly=False)
    receipt_footer = fields.Html(related="pos_config_id.receipt_footer", readonly=False)
    receipt_font = fields.Selection(related='pos_config_id.receipt_font', readonly=False)
    receipt_preview = fields.Html(compute="_compute_receipt_preview", sanitize=False)

    @api.depends('receipt_layout', 'receipt_logo', 'receipt_bg', 'receipt_bg_image', 'receipt_header', 'receipt_footer', 'receipt_font')
    def _compute_receipt_preview(self):
        for wizard in self:
            props = {
                "pos_config_id": wizard.pos_config_id.id,
                "receipt_layout": wizard.receipt_layout,
                "receipt_logo": wizard.receipt_logo and wizard.receipt_logo.decode('utf-8'),
                "receipt_bg": wizard.receipt_bg,
                "receipt_bg_image": wizard.receipt_bg_image and wizard.receipt_bg_image.decode('utf-8'),
                "receipt_header": wizard.receipt_header,
                "receipt_footer": wizard.receipt_footer,
                "receipt_font": wizard.receipt_font,
                "previewMode": True,
            }
            wizard.receipt_preview = wizard.env['ir.ui.view']._render_template(
                'point_of_sale.pos_receipt_layout_preview',
                {
                    "receipt_font": wizard.receipt_font,
                    "web_base_url": self.get_base_url(),
                    "title": "POS Receipt Preview",
                    "props": json.dumps(props)
                }
            )

    def receipt_layout_save(self):
        return self.env.context.get('report_action') or {'type': 'ir.actions.act_window_close'}

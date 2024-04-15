# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    group_uom = fields.Boolean("Units of Measure", implied_group='uom.group_uom')
    group_product_variant = fields.Boolean("Variants", implied_group='product.group_product_variant')
    module_loyalty = fields.Boolean("Promotions, Coupons, Gift Card & Loyalty Program")
    group_stock_packaging = fields.Boolean('Product Packagings',
        implied_group='product.group_stock_packaging')
    group_product_pricelist = fields.Boolean("Pricelists",
        implied_group='product.group_product_pricelist')
    group_sale_pricelist = fields.Boolean("Advanced Pricelists",
        implied_group='product.group_sale_pricelist',
        help="""Allows to manage different prices based on rules per category of customers.
                Example: 10% for retailers, promotion of 5 EUR on this product, etc.""")
    product_pricelist_setting = fields.Selection([
            ('basic', 'Multiple prices per product'),
            ('advanced', 'Advanced price rules (discounts, formulas)')
            ], default='basic', string="Pricelists Method", config_parameter='product.product_pricelist_setting',
            help="Multiple prices: Pricelists with fixed price rules by product,\nAdvanced rules: enables advanced price rules for pricelists.")
    product_weight_in_lbs = fields.Selection([
        ('0', 'Kilograms'),
        ('1', 'Pounds'),
    ], 'Weight unit of measure', config_parameter='product.weight_in_lbs', default='0')
    product_volume_volume_in_cubic_feet = fields.Selection([
        ('0', 'Cubic Meters'),
        ('1', 'Cubic Feet'),
    ], 'Volume unit of measure', config_parameter='product.volume_in_cubic_feet', default='0')
    module_product_barcodelookup = fields.Boolean("Barcode Database")
    barcodelookup_api_key = fields.Char(string='API key', config_parameter='product_barcodelookup.api_key',
                                        help='Barcode Lookup API Key for create product from barcode.')

    @api.onchange('group_product_pricelist')
    def _onchange_group_sale_pricelist(self):
        if not self.group_product_pricelist:
            if self.group_sale_pricelist:
                self.group_sale_pricelist = False
            active_pricelist = self.env['product.pricelist'].sudo().search([('active', '=', True)])
            if active_pricelist:
                return {
                    'warning': {
                    'message': _("You are deactivating the pricelist feature. "
                                 "Every active pricelist will be archived.")
                }}

    @api.onchange('product_pricelist_setting')
    def _onchange_product_pricelist_setting(self):
        if self.product_pricelist_setting == 'basic':
            self.group_sale_pricelist = False
        else:
            self.group_sale_pricelist = True

    def set_values(self):
        had_group_pl = self.default_get(['group_product_pricelist'])['group_product_pricelist']
        super().set_values()

        if self.group_product_pricelist and not had_group_pl:
            self.env['res.company']._activate_or_create_pricelists()
        elif not self.group_product_pricelist:
            self.env['product.pricelist'].sudo().search([]).action_archive()
